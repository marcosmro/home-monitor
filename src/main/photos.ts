import { ApiError, CaptureOutcomeUnknown } from "./api";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { Photo, PhotoPage, CaptureJob } from "../shared/cameras";
import type { Monitor } from "./service";

export class PhotoStore {
  constructor(private root: string) {}
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
    return photo;
  }
  async list(scope: string, offset = 0, cameraId?: string): Promise<PhotoPage> {
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
        photos: matching.slice(offset, offset + 48),
        total: matching.length,
      };
    }
    const photos: Photo[] = [];
    for (const name of names.slice(offset, offset + 48))
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
  ) {}
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
      void (async () => {
        try {
          for (const [i, device] of devices.entries()) {
            if (this.job.stopping || this.scope() !== scope) break;
            if (i > 0 && !demo) {
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
              if (this.job.stopping || this.scope() !== scope) break;
            }
            const item = this.job.items[i];
            item.state = "capturing";
            item.startedAt = Date.now();
            this.job.revision++;
            try {
              const data = demo
                ? await this.demoImage()
                : await this.monitor.captureCamera(device);
              await this.store.save(
                scope,
                {
                  cameraId: device.id,
                  cameraName: item.name,
                  room: `${device.floorEs || device.floor} · ${device.roomEs || device.room}`,
                  demo,
                },
                data,
              );
              item.state = "saved";
              item.finishedAt = Date.now();
            } catch (error) {
              item.state =
                error instanceof CaptureOutcomeUnknown ? "unknown" : "failed";
              item.message = (error as Error).message;
              // A definitive method rejection is isolated to this camera. Never
              // retry it, but let the remaining cameras in the requested batch run.
              if (!(error instanceof ApiError && error.status === 405))
                this.job.stopping = true;
            }
            this.job.revision++;
          }
        } finally {
          for (const item of this.job.items)
            if (item.state === "queued") item.state = "cancelled";
          this.job.running = false;
          this.job.revision++;
          this.monitor.finishCameras();
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
