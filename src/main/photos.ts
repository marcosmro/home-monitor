import { ApiError, CaptureOutcomeUnknown, EmptyCapture } from "./api";
import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type {
  Photo,
  PhotoPage,
  CaptureJob,
  CaptureLogEntry,
} from "../shared/cameras";
import {
  CHANGES_VERSION,
  compareThumbs,
  type PhotoChanges,
  type Thumb,
} from "../shared/photo-changes";
import type { Monitor } from "./service";

export class PhotoStore {
  constructor(
    private root: string,
    /**
     * Turns image bytes into a small thumbnail for comparing photos. Without
     * it (or when an image cannot be decoded) photos are simply not compared.
     */
    private decode?: (data: Buffer) => Thumb | undefined,
  ) {}
  private folder(scope: string) {
    return join(this.root, createHash("sha256").update(scope).digest("hex"));
  }
  private file(scope: string, id: string, suffix: string) {
    if (!/^\d{13}-[a-f0-9-]{36}$/.test(id))
      throw new Error("Invalid photo identifier.");
    return join(this.folder(scope), id + suffix);
  }
  async save(
    scope: string,
    input: Omit<Photo, "id" | "bytes" | "receivedAt">,
    base64: string,
  ): Promise<Photo> {
    const encoded = base64
      .replace(/^data:image\/(jpeg|png);base64,/, "")
      .replace(/\s/g, "");
    if (encoded.length > 14_000_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))
      throw new Error("Invalid or oversized camera image.");
    const data = Buffer.from(encoded, "base64");
    const jpeg = data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
    const png = data
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    if (!jpeg && !png)
      throw new Error("Camera response was not a JPEG or PNG image.");
    const photo: Photo = {
      ...input,
      id: `${Date.now()}-${randomUUID()}`,
      bytes: data.length,
      receivedAt: new Date().toISOString(),
    };
    await fs.mkdir(this.folder(scope), { recursive: true, mode: 0o700 });
    const image = this.file(scope, photo.id, ".image");
    try {
      await fs.writeFile(image, data, { mode: 0o600, flag: "wx" });
      await fs.writeFile(
        this.file(scope, photo.id, ".json"),
        JSON.stringify(photo),
        { mode: 0o600, flag: "wx" },
      );
    } catch (error) {
      await fs.rm(image, { force: true });
      throw error;
    }
    // A photo is saved whether or not it can be compared.
    const changes = await this.changes(scope, photo.id).catch(() => undefined);
    return changes === undefined ? photo : { ...photo, changes };
  }
  /**
   * How a saved photo differs from the previous one of the same camera.
   * Computed once on this computer and kept with the photo's details; `null`
   * when there is no earlier photo, or one of the two cannot be read.
   */
  async changes(
    scope: string,
    id: string,
  ): Promise<PhotoChanges | null | undefined> {
    const path = this.file(scope, id, ".json");
    const photo: Photo = JSON.parse(await fs.readFile(path, "utf8"));
    if (photo.changes === null || photo.changes?.version === CHANGES_VERSION)
      return photo.changes;
    // Without a decoder nothing is recorded, so a later run can still compare.
    if (!this.decode) return undefined;
    let changes: PhotoChanges | null = null;
    const older = (await this.list(scope, 0, photo.cameraId, Infinity)).photos;
    const previous = older[older.findIndex((p) => p.id === id) + 1];
    if (previous) {
      const read = async (photoId: string) =>
        this.decode!(await fs.readFile(this.file(scope, photoId, ".image")));
      const before = await read(previous.id),
        after = await read(id);
      if (before && after)
        changes = {
          version: CHANGES_VERSION,
          previousId: previous.id,
          previousAt: previous.receivedAt,
          ...compareThumbs(before, after),
        };
    }
    await fs.writeFile(path + ".tmp", JSON.stringify({ ...photo, changes }), {
      mode: 0o600,
    });
    await fs.rename(path + ".tmp", path);
    return changes;
  }
  async list(
    scope: string,
    offset = 0,
    cameraId?: string,
    limit = 48,
  ): Promise<PhotoPage> {
    if (!Number.isInteger(offset) || offset < 0)
      throw new Error("Invalid page.");
    if (
      cameraId !== undefined &&
      (typeof cameraId !== "string" || !cameraId || cameraId.length > 500)
    )
      throw new Error("Invalid camera identifier.");
    let names: string[];
    try {
      names = (await fs.readdir(this.folder(scope)))
        .filter((n) => /^\d{13}-[a-f0-9-]{36}\.json$/.test(n))
        .sort()
        .reverse();
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT")
        return { photos: [], total: 0 };
      throw e;
    }
    if (cameraId !== undefined) {
      const matching: Photo[] = [];
      for (const name of names) {
        const photo: Photo = JSON.parse(
          await fs.readFile(join(this.folder(scope), name), "utf8"),
        );
        if (photo.cameraId === cameraId) matching.push(photo);
      }
      return {
        photos: matching.slice(offset, offset + limit),
        total: matching.length,
      };
    }
    const photos: Photo[] = [];
    for (const name of names.slice(offset, offset + limit))
      photos.push(
        JSON.parse(await fs.readFile(join(this.folder(scope), name), "utf8")),
      );
    return { photos, total: names.length };
  }
  async image(scope: string, id: string) {
    const data = await fs.readFile(this.file(scope, id, ".image"));
    return `data:image/${data[0] === 0xff ? "jpeg" : "png"};base64,${data.toString("base64")}`;
  }
  async remove(scope: string, id: string) {
    await fs.rm(this.file(scope, id, ".json"), { force: true });
    await fs.rm(this.file(scope, id, ".image"), { force: true });
  }
}

/**
 * The local capture log: one JSON line per live photo request, so a camera
 * that keeps failing can be diagnosed afterwards. Owner-only, kept to the
 * most recent `keep` lines, and never sent anywhere.
 */
export class CaptureLog {
  private pending: Promise<unknown> = Promise.resolve();
  constructor(
    private path: string,
    private keep = 500,
  ) {}
  append(entry: CaptureLogEntry): Promise<void> {
    const job = this.pending
      .catch(() => {})
      .then(async () => {
        await fs.mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
        const lines = (await fs.readFile(this.path, "utf8").catch(() => ""))
          .split("\n")
          .filter(Boolean);
        lines.push(JSON.stringify(entry));
        await fs.writeFile(
          this.path + ".tmp",
          lines.slice(-this.keep).join("\n") + "\n",
          { mode: 0o600 },
        );
        await fs.rename(this.path + ".tmp", this.path);
      });
    this.pending = job;
    return job;
  }
}

/**
 * A capture failure worth repeating: the server answered in full and refused
 * this one attempt (a camera that is still waking up answers 4xx/5xx, or with
 * no photo), so nothing was taken and asking again is safe. Never a timeout
 * (the camera may still be working), an authentication or permission error,
 * the request budget, or a method rejection, which will not change.
 */
export const isTransientCapture = (error: unknown) =>
  error instanceof EmptyCapture ||
  (error instanceof ApiError &&
    error.status >= 400 &&
    ![401, 403, 405, 429].includes(error.status));

export class CameraController {
  private job: CaptureJob = {
    running: false,
    stopping: false,
    items: [],
    revision: 0,
  };
  private jobScope = "";
  private wakePause?: () => void;
  constructor(
    private monitor: Monitor,
    private store: PhotoStore,
    private demoImage: () => Promise<string>,
    private spacingMs = 10000,
    /** Extra attempts for a camera after a transient failure. */
    private retries = 2,
    /** Receives every live attempt's outcome, for the local capture log. */
    private log: (entry: CaptureLogEntry) => void = () => {},
    /** Receives the photos a finished batch saved, live or demo. */
    private done: (photos: Photo[]) => void = () => {},
  ) {}
  /** Waits out the spacing between capture requests; a stop ends it early. */
  private async pause() {
    this.job.pauseUntil = Date.now() + this.spacingMs;
    this.job.revision++;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        this.wakePause = undefined;
        resolve();
      }, this.spacingMs);
      this.wakePause = () => {
        clearTimeout(timer);
        this.wakePause = undefined;
        resolve();
      };
    });
    this.job.pauseUntil = undefined;
    this.job.revision++;
  }
  scope() {
    return `${this.monitor.snap.demo ? "demo" : "live"}:${this.monitor.snap.panelId}`;
  }
  state() {
    return this.jobScope === this.scope()
      ? structuredClone(this.job)
      : { running: false, stopping: false, items: [], revision: 0 };
  }
  async start(ids: string[]) {
    if (this.job.running)
      throw new Error("A capture batch is already running.");
    // Reserve synchronously, including while the initial state check is pending.
    this.job = {
      running: true,
      stopping: false,
      items: [],
      revision: this.job.revision + 1,
    };
    this.jobScope = this.scope();
    try {
      const devices = await this.monitor.prepareCameras(ids);
      const scope = this.scope(),
        demo = this.monitor.snap.demo;
      this.job.spacingMs = demo ? 0 : this.spacingMs;
      this.job.items = devices.map((d) => ({
        cameraId: d.id,
        name: d.spanish || d.original,
        state: "queued",
      }));
      const saved: Photo[] = [];
      void (async () => {
        try {
          for (const [i, device] of devices.entries()) {
            if (this.job.stopping || this.scope() !== scope) break;
            if (i > 0 && !demo) {
              await this.pause();
              if (this.job.stopping || this.scope() !== scope) break;
            }
            const item = this.job.items[i];
            for (let attempt = 1; ; attempt++) {
              item.state = "capturing";
              item.attempt = attempt;
              item.startedAt = Date.now();
              this.job.revision++;
              const record = (
                outcome: CaptureLogEntry["outcome"],
                error?: unknown,
              ) => {
                if (demo) return;
                const api = error instanceof ApiError ? error : undefined;
                this.log({
                  at: new Date().toISOString(),
                  camera: item.name,
                  cameraId: device.id,
                  attempt,
                  outcome,
                  ms: Date.now() - item.startedAt!,
                  ...(api ? { status: api.status } : {}),
                  ...(error
                    ? { message: (error as Error).message.slice(0, 300) }
                    : {}),
                  ...(api?.details?.serverMessage
                    ? { serverMessage: api.details.serverMessage }
                    : {}),
                });
              };
              try {
                const data = demo
                  ? await this.demoImage()
                  : await this.monitor.captureCamera(device);
                const photo = await this.store.save(
                  scope,
                  {
                    cameraId: device.id,
                    cameraName: item.name,
                    room: `${device.floorEs || device.floor} · ${device.roomEs || device.room}`,
                    demo,
                  },
                  data,
                );
                saved.push(photo);
                item.state = "saved";
                item.message = undefined;
                item.finishedAt = Date.now();
                record("saved");
              } catch (error) {
                const transient = isTransientCapture(error);
                const retrying = transient && attempt <= this.retries;
                record(
                  retrying
                    ? "retrying"
                    : error instanceof CaptureOutcomeUnknown
                      ? "unknown"
                      : "failed",
                  error,
                );
                if (retrying) {
                  // Some cameras refuse the first request and answer the next.
                  item.message = `Attempt ${attempt} failed${error instanceof ApiError ? ` (HTTP ${error.status})` : ""}. Trying again…`;
                  if (!demo) await this.pause();
                  if (!this.job.stopping && this.scope() === scope) continue;
                }
                item.state =
                  error instanceof CaptureOutcomeUnknown ? "unknown" : "failed";
                item.message = (error as Error).message;
                // A refusal of this one camera (a method rejection, or a
                // transient error that outlasted its retries) is recorded and
                // the remaining cameras still run. Anything else stops the batch.
                if (
                  !transient &&
                  !(error instanceof ApiError && error.status === 405)
                )
                  this.job.stopping = true;
              }
              break;
            }
            this.job.revision++;
          }
        } finally {
          for (const item of this.job.items)
            if (item.state === "queued") item.state = "cancelled";
          this.job.running = false;
          this.job.revision++;
          this.monitor.finishCameras();
          if (saved.length) this.done(saved);
        }
      })();
      return this.state();
    } catch (error) {
      this.job.running = false;
      this.job.revision++;
      throw error;
    }
  }
  cancel() {
    this.job.stopping = true;
    this.wakePause?.();
    this.job.revision++;
    return this.state();
  }
}
