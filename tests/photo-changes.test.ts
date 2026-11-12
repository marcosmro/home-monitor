import { afterEach, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CHANGES_VERSION,
  changeSummary,
  changesNotification,
  compareThumbs,
  type Thumb,
} from "../src/shared/photo-changes";
import { PhotoStore } from "../src/main/photos";

const W = 160,
  H = 120;
/** A room-like picture: a gradient wall, a dark floor and a striped cabinet. */
function scene(
  draw?: (set: (x: number, y: number, rgb: number[]) => void) => void,
  { gain = 1, offset = 0, shift = 0 } = {},
): Thumb {
  const data = new Uint8Array(W * H * 4);
  const set = (x: number, y: number, [r, g, b]: number[]) => {
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    data.set([r, g, b, 255], (y * W + x) * 4);
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const sx = x - shift;
      const base =
        y > 80
          ? [40, 40, 45]
          : sx > 100 && sx < 140 && y > 30
            ? sx % 8 < 4
              ? [150, 120, 90]
              : [110, 85, 60]
            : [150 + sx / 4, 150 + y / 4, 140];
      set(x, y, base);
    }
  draw?.(set);
  for (let i = 0; i < data.length; i += 4)
    for (let c = 0; c < 3; c++)
      data[i + c] = Math.max(0, Math.min(255, data[i + c] * gain + offset));
  return { width: W, height: H, data };
}
const box =
  (x0: number, y0: number, w: number, h: number, rgb: number[]) =>
  (set: (x: number, y: number, rgb: number[]) => void) => {
    for (let y = y0; y < y0 + h; y++)
      for (let x = x0; x < x0 + w; x++)
        // A patterned object, so it adds detail and not just a flat patch.
        set(x, y, (x + y) % 4 < 2 ? rgb : rgb.map((v) => v * 0.6));
  };

it("finds an object that appeared and one that is gone, and where", () => {
  const empty = scene(),
    withMug = scene(box(40, 50, 12, 16, [200, 30, 30]));
  const appeared = compareThumbs(empty, withMug);
  expect(appeared.scene).toBe(false);
  expect(appeared.regions).toHaveLength(1);
  const [r] = appeared.regions;
  // The box covers the object, give or take the one-pixel growth.
  expect(r.x * W).toBeGreaterThanOrEqual(37);
  expect((r.x + r.w) * W).toBeLessThanOrEqual(55);
  expect(r.y * H).toBeGreaterThanOrEqual(47);
  expect((r.y + r.h) * H).toBeLessThanOrEqual(69);
  const gone = compareThumbs(withMug, empty);
  expect(gone.regions).toHaveLength(1);
});

it("reports a moved object as two places, strongest first", () => {
  const regions = compareThumbs(
    scene(box(20, 90, 14, 20, [220, 220, 60])),
    scene(box(70, 90, 14, 20, [220, 220, 60])),
  ).regions;
  expect(regions).toHaveLength(2);
  expect(regions[0].strength).toBeGreaterThanOrEqual(regions[1].strength);
});

it("ignores a different exposure, a hair of camera shake and identical photos", () => {
  const base = scene();
  expect(compareThumbs(base, scene()).regions).toEqual([]);
  expect(
    compareThumbs(base, scene(undefined, { gain: 1.12, offset: 8 })).regions,
  ).toEqual([]);
  expect(compareThumbs(base, scene(undefined, { shift: 1 })).regions).toEqual(
    [],
  );
});

it("calls a wholly different view a scene change rather than listing regions", () => {
  const night = scene();
  for (let i = 0; i < night.data.length; i += 4)
    night.data.set(
      [(i / 4) % W, 255 - ((i / 4 / W) | 0) * 2, (i * 7) % 255],
      i,
    );
  const result = compareThumbs(scene(), night);
  expect(result).toMatchObject({ scene: true, regions: [] });
  expect(changeSummary(result)).toContain("whole view");
  expect(changeSummary(result, "es")).toContain("Toda la vista");
});

it("words one notification per batch, only when something differs", () => {
  const changes = {
    version: CHANGES_VERSION,
    previousId: "p",
    previousAt: "2026-11-12T10:00:00.000Z",
    changed: 0.02,
    scene: false,
    regions: [{ x: 0, y: 0, w: 0.1, h: 0.1, strength: 0.5 }],
  };
  const quiet = { ...changes, regions: [] };
  expect(
    changesNotification(
      [
        { cameraName: "Garaje", changes: quiet },
        { cameraName: "Entrada", changes: null },
        { cameraName: "Salón" },
      ],
      "Casa",
    ),
  ).toBeUndefined();
  expect(
    changesNotification(
      [
        { cameraName: "Cocina", changes },
        { cameraName: "Garaje", changes: quiet },
        { cameraName: "Sala", changes: { ...quiet, scene: true } },
      ],
      "Casa",
      "es",
    ),
  ).toEqual({
    title: "Casa: cambios en las fotos",
    body: "Cocina: 1 posible cambio\nSala: Toda la vista ha cambiado (luz o cámara movida)",
  });
});

const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=";
const dirs: string[] = [];
afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
});
it("compares each saved photo with the same camera's previous one, once, and keeps the result", async () => {
  const root = await mkdtemp(join(tmpdir(), "home-changes-test-"));
  dirs.push(root);
  // The decoder is the only platform-specific part; here it serves thumbnails
  // in the order the store asks for them (previous photo first, then new).
  const thumbs: Thumb[] = [];
  let decoded = 0;
  const store = new PhotoStore(root, () => {
    decoded++;
    return thumbs.shift();
  });
  const meta = { cameraName: "Cocina", room: "Planta baja", demo: false };
  const first = await store.save("home", { ...meta, cameraId: "a" }, png);
  expect(first.changes).toBeNull();
  // Another camera's photo is never the baseline.
  const other = await store.save("home", { ...meta, cameraId: "b" }, png);
  expect(other.changes).toBeNull();
  expect(decoded).toBe(0);
  thumbs.push(scene(), scene(box(40, 50, 12, 16, [200, 30, 30])));
  const second = await store.save("home", { ...meta, cameraId: "a" }, png);
  expect(second.changes).toMatchObject({
    version: CHANGES_VERSION,
    previousId: first.id,
    previousAt: first.receivedAt,
    scene: false,
    regions: [{ strength: expect.any(Number) }],
  });
  // Stored with the photo: listed, and never recomputed.
  expect((await store.list("home", 0, "a")).photos[0].changes).toEqual(
    second.changes,
  );
  expect(await store.changes("home", second.id)).toEqual(second.changes);
  expect(decoded).toBe(2);
  // A photo saved before comparisons existed is compared on request.
  const legacy = new PhotoStore(root);
  const old = await legacy.save("home", { ...meta, cameraId: "a" }, png);
  expect(old.changes).toBeUndefined();
  thumbs.push(scene(), scene());
  expect(await store.changes("home", old.id)).toMatchObject({
    previousId: second.id,
    regions: [],
  });
  // An unreadable image leaves the photo saved and simply not compared.
  const unreadable = await store.save("home", { ...meta, cameraId: "a" }, png);
  expect(unreadable.changes).toBeNull();
  expect(await store.image("home", unreadable.id)).toContain(png);
  expect(
    JSON.parse(
      await readFile(
        join(
          root,
          (await import("node:fs")).readdirSync(root)[0],
          `${unreadable.id}.json`,
        ),
        "utf8",
      ),
    ).changes,
  ).toBeNull();
});
