import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PhotoStore, CameraController } from "../src/main/photos";
import { Monitor } from "../src/main/service";
import { SectorApi, ApiError, CaptureOutcomeUnknown } from "../src/main/api";
const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=";
const dirs: string[] = [];
afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
});
async function store() {
  const path = await mkdtemp(join(tmpdir(), "home-photo-test-"));
  dirs.push(path);
  return new PhotoStore(path);
}
const metadata = {
  cameraId: "camera",
  cameraName: "Demo camera",
  room: "Demo",
  demo: true,
};
function monitor() {
  return new Monitor(
    new SectorApi({
      hour: Math.floor(Date.now() / 3600000),
      used: 0,
      blockedUntil: 0,
    }),
    () => {},
  );
}

describe("local photo library", () => {
  it("survives store recreation, isolates properties, and supports deletion", async () => {
    const s = await store(),
      p = await s.save("home-a", metadata, png);
    const reopened = new PhotoStore(dirs[0]);
    expect((await reopened.list("home-a")).photos[0].id).toBe(p.id);
    expect((await reopened.list("home-b")).total).toBe(0);
    expect(await reopened.image("home-a", p.id)).toContain(png);
    await expect(reopened.image("home-b", p.id)).rejects.toThrow();
    await reopened.remove("home-a", p.id);
    expect((await s.list("home-a")).total).toBe(0);
    await expect(s.image("home-a", p.id)).rejects.toThrow();
    expect((await stat(dirs[0])).mode & 0o077).toBe(0);
  });
  it("rejects paths, invalid images and invalid pages", async () => {
    const s = await store();
    await expect(s.image("x", "../../credentials.secure.json")).rejects.toThrow(
      "identifier",
    );
    await expect(
      s.save("x", metadata, btoa("<html>error</html>")),
    ).rejects.toThrow("JPEG or PNG");
    await expect(s.list("x", -1)).rejects.toThrow("page");
  });
});
describe("sequential capture queue", () => {
  it("allows only one in-flight photo, prevents duplicate batches, and cancels pending cameras", async () => {
    const m = monitor(),
      s = await store();
    let release!: (s: string) => void;
    const capture = vi.fn(
      () =>
        new Promise<string>((r) => {
          release = r;
        }),
    );
    const c = new CameraController(m, s, capture);
    const ids = m.snap.devices
      .filter((d) => d.type === "CameraPIR")
      .slice(0, 3)
      .map((d) => d.id);
    await c.start(ids);
    expect(capture).toHaveBeenCalledTimes(1);
    await expect(c.start(ids)).rejects.toThrow("already running");
    expect(() => m.demo()).toThrow("current photo");
    c.cancel();
    release(png);
    await vi.waitFor(() => expect(c.state().running).toBe(false));
    expect(c.state().items.map((i) => i.state)).toEqual([
      "saved",
      "cancelled",
      "cancelled",
    ]);
    expect((await s.list(c.scope())).total).toBe(1);
    expect(m.cameraBusy).toBe(false);
  });
  it("stops after a failed photo without retrying or starting the next camera", async () => {
    const m = monitor(),
      s = await store(),
      capture = vi.fn().mockRejectedValue(new Error("Unknown outcome"));
    const c = new CameraController(m, s, capture);
    await c.start(
      m.snap.devices
        .filter((d) => d.type === "CameraPIR")
        .slice(0, 2)
        .map((d) => d.id),
    );
    await vi.waitFor(() => expect(c.state().running).toBe(false));
    expect(capture).toHaveBeenCalledTimes(1);
    expect(c.state().items.map((i) => i.state)).toEqual([
      "failed",
      "cancelled",
    ]);
    expect(m.cameraBusy).toBe(false);
  });
  it("requires fully armed state and rejects non-camera IDs", async () => {
    const m = monitor();
    await expect(m.prepareCameras([m.snap.devices[0].id])).rejects.toThrow(
      "available cameras",
    );
    m.snap.mode = "disarmed";
    await expect(m.prepareCameras(["demo-3"])).rejects.toThrow("fully armed");
    expect(m.cameraBusy).toBe(false);
  });
  it("rejects batches without budget before making state requests", async () => {
    const m = new Monitor(
      new SectorApi({
        hour: Math.floor(Date.now() / 3600000),
        used: 42,
        blockedUntil: 0,
      }),
      () => {},
    );
    m.snap.demo = false;
    await expect(m.prepareCameras(["demo-3"])).rejects.toThrow("budget");
    expect(m.cameraBusy).toBe(false);
  });
  it("uses a long timeout and disables GET retries for the physical capture", async () => {
    const m = monitor();
    m.snap.demo = false;
    m.cameraBusy = true;
    const api = (m as any).api;
    const request = vi.spyOn(api, "request").mockResolvedValue({ image: png });
    expect(await m.captureCamera(m.snap.devices[3])).toBe(png);
    expect(request).toHaveBeenCalledWith(
      expect.stringContaining("/cameras/demo-3/takepicture"),
      undefined,
      true,
      false,
      120000,
    );
    request.mockRejectedValue(new ApiError("timeout"));
    await expect(m.captureCamera(m.snap.devices[3])).rejects.toThrow(
      "outcome is unknown",
    );
    expect(request).toHaveBeenCalledTimes(2);
  });
});

it("runs a complete batch sequentially and retains every result", async () => {
  const m = monitor(),
    s = await store();
  let active = 0,
    maximum = 0;
  const capture = vi.fn(async () => {
    active++;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active--;
    return png;
  });
  const c = new CameraController(m, s, capture);
  await c.start(["demo-3", "demo-7", "demo-11"]);
  await vi.waitFor(() => expect(c.state().running).toBe(false));
  expect(maximum).toBe(1);
  expect(capture).toHaveBeenCalledTimes(3);
  expect(c.state().items.every((i) => i.state === "saved")).toBe(true);
  expect((await s.list(c.scope())).total).toBe(3);
});

it("uses the documented legacy camera ID, never a guessed serial", async () => {
  const m = monitor();
  m.snap.demo = false;
  m.cameraBusy = true;
  const request = vi
    .spyOn((m as any).api, "request")
    .mockResolvedValue({ Image: png });
  const d = {
    ...m.snap.devices[3],
    cameraRoute: "legacy" as const,
    legacyCameraId: "42",
  };
  await m.captureCamera(d);
  expect(request).toHaveBeenCalledWith(
    expect.stringContaining("&deviceId=42"),
    undefined,
    true,
    false,
    120000,
  );
  await expect(
    m.captureCamera({ ...d, legacyCameraId: undefined }),
  ).rejects.toThrow("identifier");
  expect(request).toHaveBeenCalledTimes(1);
});

it("continues after a camera-specific 405 without repeating that camera", async () => {
  const m = monitor(),
    s = await store();
  const capture = vi
    .fn()
    .mockResolvedValueOnce(png)
    .mockRejectedValueOnce(new ApiError("Camera rejected capture", 405))
    .mockResolvedValueOnce(png);
  const c = new CameraController(m, s, capture);
  await c.start(["demo-3", "demo-7", "demo-11"]);
  await vi.waitFor(() => expect(c.state().running).toBe(false));
  expect(c.state().items.map((i) => i.state)).toEqual([
    "saved",
    "failed",
    "saved",
  ]);
  expect(capture).toHaveBeenCalledTimes(3);
  expect((await s.list(c.scope())).total).toBe(2);
});

it("preserves capture error explanations and allowed methods without retrying", async () => {
  const fetcher = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ detail: "camera_is_busy" }), {
      status: 405,
      headers: { Allow: "POST, OPTIONS" },
    }),
  );
  const api = new SectorApi(
    { hour: Math.floor(Date.now() / 3600000), used: 0, blockedUntil: 0 },
    () => {},
    fetcher,
  );
  await expect(
    api.request(
      "/api/vs2/alarmsystems/v3/panels/demo/components/cameras/demo/takepicture",
      undefined,
      false,
      false,
      120000,
    ),
  ).rejects.toMatchObject({
    status: 405,
    details: {
      serverMessage: "camera_is_busy",
      allowedMethods: ["POST", "OPTIONS"],
    },
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("reports the per-camera 405 diagnostic without changing HTTP methods", async () => {
  const m = monitor();
  m.snap.demo = false;
  m.cameraBusy = true;
  const request = vi.spyOn((m as any).api, "request").mockRejectedValue(
    new ApiError("Rejected", 405, {
      serverMessage: "Not available for this camera",
      allowedMethods: ["POST"],
    }),
  );
  await expect(m.captureCamera(m.snap.devices[3])).rejects.toThrow(
    "Sector Alarm: Not available for this camera",
  );
  expect(request).toHaveBeenCalledTimes(1);
});

it("pauses between live cameras and can cancel during the pause", async () => {
  const m = monitor(),
    s = await store();
  m.snap.demo = false;
  vi.spyOn(m, "prepareCameras").mockImplementation(async (ids) => {
    m.cameraBusy = true;
    return ids.map((id) => m.snap.devices.find((d) => d.id === id)!);
  });
  const capture = vi.spyOn(m, "captureCamera").mockResolvedValue(png);
  const c = new CameraController(m, s, async () => png, 1000);
  await c.start(["demo-3", "demo-7"]);
  await vi.waitFor(() => expect(c.state().pauseUntil).toBeDefined(), {
    interval: 5,
  });
  expect(capture).toHaveBeenCalledTimes(1);
  expect(c.state().running).toBe(true);
  c.cancel();
  await vi.waitFor(() => expect(c.state().running).toBe(false));
  expect(capture).toHaveBeenCalledTimes(1);
  expect(c.state().items.map((i) => i.state)).toEqual(["saved", "cancelled"]);
});

it("labels incomplete-response outcomes unknown and stops the remaining cameras", async () => {
  const m = monitor(),
    s = await store();
  const capture = vi
    .fn()
    .mockRejectedValue(new CaptureOutcomeUnknown("No response"));
  const c = new CameraController(m, s, capture);
  await c.start(["demo-3", "demo-7"]);
  await vi.waitFor(() => expect(c.state().running).toBe(false));
  expect(c.state().items.map((i) => i.state)).toEqual(["unknown", "cancelled"]);
  expect(capture).toHaveBeenCalledTimes(1);
});

it("unwraps a JSON-encoded error message instead of showing raw JSON", async () => {
  const fetcher = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify(
        JSON.stringify({
          message: "The method is not allowed for the requested URL.",
        }),
      ),
      { status: 405 },
    ),
  );
  const api = new SectorApi(
    { hour: Math.floor(Date.now() / 3600000), used: 0, blockedUntil: 0 },
    () => {},
    fetcher,
  );
  await expect(
    api.request(
      "/api/Panel/TakePicture?panelId=demo&deviceId=demo",
      undefined,
      false,
      false,
    ),
  ).rejects.toMatchObject({
    details: {
      serverMessage: "The method is not allowed for the requested URL.",
    },
  });
});

it("filters a camera's library before pagination and preserves account isolation", async () => {
  const s = await store();
  const quiet = await s.save("house", { ...metadata, cameraId: "quiet" }, png);
  for (let i = 0; i < 50; i++)
    await s.save("house", { ...metadata, cameraId: "busy" }, png);
  const quietPage = await s.list("house", 0, "quiet");
  expect(quietPage.photos.map((p) => p.id)).toEqual([quiet.id]);
  expect(quietPage.total).toBe(1);
  const first = await s.list("house", 0, "busy");
  const older = await s.list("house", 48, "busy");
  expect(first.photos).toHaveLength(48);
  expect(older.photos).toHaveLength(2);
  expect(
    new Set([...first.photos, ...older.photos].map((p) => p.id)).size,
  ).toBe(50);
  expect(first.total).toBe(50);
  expect((await s.list("other-house", 0, "quiet")).total).toBe(0);
  await expect(s.list("house", 0, {} as string)).rejects.toThrow(
    "camera identifier",
  );
});
