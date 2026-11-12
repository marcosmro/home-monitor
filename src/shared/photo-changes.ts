/**
 * What changed between two photos from the same fixed camera.
 *
 * Works on small RGBA thumbnails, entirely on this computer. It is a
 * comparison of pixels, not recognition: it reports where the picture
 * differs, never what an object is or whether it arrived, left or moved.
 * Every result is a place for a person to look at.
 */
export interface Thumb {
  width: number;
  height: number;
  /** RGBA, row by row. */
  data: Uint8Array | Uint8ClampedArray;
}
export interface ChangeRegion {
  /** Box in fractions of the picture (0–1). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** 0–1: how strongly and how widely the box differs. */
  strength: number;
}
export interface PhotoChanges {
  /** Algorithm version, so stored results can be recomputed when it improves. */
  version: number;
  previousId: string;
  previousAt: string;
  /** Fraction of the picture that differs. */
  changed: number;
  /**
   * The whole view differs (lighting, day/night mode, or a moved camera), so
   * individual regions would mean nothing and none are listed.
   */
  scene: boolean;
  regions: ChangeRegion[];
}
export const CHANGES_VERSION = 1;
/** Photos are compared at this size: small enough to be instant, large
 * enough that a cup on a counter still covers a few dozen pixels. */
export const THUMB_WIDTH = 320;
export const THUMB_HEIGHT = 240;

/** Box blur over a 3×3 window, per channel, to quiet JPEG noise. */
function smooth({ width: w, height: h, data }: Thumb) {
  const out = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      for (let c = 0; c < 3; c++) {
        let sum = 0,
          n = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const yy = y + dy,
              xx = x + dx;
            if (yy < 0 || yy >= h || xx < 0 || xx >= w) continue;
            sum += data[(yy * w + xx) * 4 + c];
            n++;
          }
        out[(y * w + x) * 3 + c] = sum / n;
      }
  return out;
}
function median(values: Float32Array) {
  const sorted = Float32Array.from(values).sort();
  return sorted[sorted.length >> 1];
}
/**
 * Brings `from` to the overall brightness and contrast of `to`, per channel,
 * so a slightly different exposure is not reported as a change everywhere.
 */
function matchExposure(from: Float32Array, to: Float32Array) {
  const n = from.length / 3;
  for (let c = 0; c < 3; c++) {
    let mf = 0,
      mt = 0;
    for (let i = c; i < from.length; i += 3) {
      mf += from[i];
      mt += to[i];
    }
    mf /= n;
    mt /= n;
    let vf = 0,
      vt = 0;
    for (let i = c; i < from.length; i += 3) {
      vf += (from[i] - mf) ** 2;
      vt += (to[i] - mt) ** 2;
    }
    // Gain is kept moderate: a real change must not be explained away.
    const gain = Math.min(1.5, Math.max(0.67, Math.sqrt((vt + 1) / (vf + 1))));
    for (let i = c; i < from.length; i += 3)
      from[i] = (from[i] - mf) * gain + mt;
  }
}
/**
 * Compares two thumbnails of the same size. `sensitivity` scales the
 * threshold: above 1 reports fainter differences, below 1 only bolder ones.
 */
export function compareThumbs(
  before: Thumb,
  after: Thumb,
  sensitivity = 1,
): Pick<PhotoChanges, "changed" | "scene" | "regions"> {
  const w = after.width,
    h = after.height;
  if (before.width !== w || before.height !== h)
    throw new Error("Photos must be compared at the same size.");
  const a = smooth(before),
    b = smooth(after);
  matchExposure(a, b);
  // A pixel differs only if no neighbour within one step explains it, in
  // either direction: a camera that settles a hair differently is no change.
  const diff = new Float32Array(w * h);
  const nearest = (p: Float32Array, q: Float32Array, x: number, y: number) => {
    const i = (y * w + x) * 3;
    let best = Infinity;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const yy = y + dy,
          xx = x + dx;
        if (yy < 0 || yy >= h || xx < 0 || xx >= w) continue;
        const j = (yy * w + xx) * 3;
        const d = Math.max(
          Math.abs(p[i] - q[j]),
          Math.abs(p[i + 1] - q[j + 1]),
          Math.abs(p[i + 2] - q[j + 2]),
        );
        if (d < best) best = d;
      }
    return best;
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      diff[y * w + x] = Math.max(nearest(b, a, x, y), nearest(a, b, x, y));
  // The threshold rises with the picture's own noise level.
  const mid = median(diff);
  const spread = median(diff.map((d) => Math.abs(d - mid)));
  // …but only so far: a view that differs everywhere must still be noticed.
  const threshold = Math.min(45, Math.max(18, mid + 6 * spread)) / sensitivity;
  const mask = new Uint8Array(w * h);
  let changedPixels = 0;
  for (let i = 0; i < diff.length; i++)
    if (diff[i] > threshold) {
      mask[i] = 1;
      changedPixels++;
    }
  const changed = changedPixels / (w * h);
  if (changed > 0.35) return { changed, scene: true, regions: [] };
  // Drop specks (fewer than three differing neighbours), then grow what is
  // left by one pixel so the parts of one object join up.
  const solid = new Uint8Array(w * h);
  const count = (m: Uint8Array, x: number, y: number) => {
    let n = 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const yy = y + dy,
          xx = x + dx;
        if (yy >= 0 && yy < h && xx >= 0 && xx < w) n += m[yy * w + xx];
      }
    return n;
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (mask[y * w + x] && count(mask, x, y) >= 4) solid[y * w + x] = 1;
  const grown = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) if (count(solid, x, y)) grown[y * w + x] = 1;
  // Connected groups of differing pixels become boxes.
  const seen = new Uint8Array(w * h);
  const minArea = Math.max(6, Math.round(w * h * 0.0006));
  type Box = {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    sum: number;
    n: number;
  };
  let boxes: Box[] = [];
  const stack: number[] = [];
  for (let start = 0; start < grown.length; start++) {
    if (!grown[start] || seen[start]) continue;
    const box: Box = { x0: w, y0: h, x1: 0, y1: 0, sum: 0, n: 0 };
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop()!,
        x = i % w,
        y = (i / w) | 0;
      box.x0 = Math.min(box.x0, x);
      box.y0 = Math.min(box.y0, y);
      box.x1 = Math.max(box.x1, x + 1);
      box.y1 = Math.max(box.y1, y + 1);
      if (solid[i]) {
        box.sum += diff[i];
        box.n++;
      }
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const yy = y + dy,
            xx = x + dx;
          if (yy < 0 || yy >= h || xx < 0 || xx >= w) continue;
          const j = yy * w + xx;
          if (grown[j] && !seen[j]) {
            seen[j] = 1;
            stack.push(j);
          }
        }
    }
    if (box.n >= minArea) boxes.push(box);
  }
  // Boxes that touch or nearly touch describe one change.
  const near = (p: Box, q: Box, gap: number) =>
    p.x0 - gap < q.x1 &&
    q.x0 - gap < p.x1 &&
    p.y0 - gap < q.y1 &&
    q.y0 - gap < p.y1;
  const gap = Math.round(w * 0.02);
  for (let merged = true; merged;) {
    merged = false;
    outer: for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++)
        if (near(boxes[i], boxes[j], gap)) {
          const p = boxes[i],
            q = boxes[j];
          boxes[i] = {
            x0: Math.min(p.x0, q.x0),
            y0: Math.min(p.y0, q.y0),
            x1: Math.max(p.x1, q.x1),
            y1: Math.max(p.y1, q.y1),
            sum: p.sum + q.sum,
            n: p.n + q.n,
          };
          boxes.splice(j, 1);
          merged = true;
          break outer;
        }
  }
  const regions = boxes
    .map((box): ChangeRegion => ({
      x: box.x0 / w,
      y: box.y0 / h,
      w: (box.x1 - box.x0) / w,
      h: (box.y1 - box.y0) / h,
      strength: Math.min(
        1,
        (box.sum / box.n / 255) * 2 * Math.min(1, box.n / (minArea * 6)) + 0.15,
      ),
    }))
    .sort((p, q) => q.strength - p.strength)
    .slice(0, 8);
  return { changed, scene: false, regions };
}

/** One line for a card, a notification or a list. */
export function changeSummary(
  changes: Pick<PhotoChanges, "scene" | "regions">,
  language: "en" | "es" = "en",
) {
  const es = language === "es";
  if (changes.scene)
    return es
      ? "Toda la vista ha cambiado (luz o cámara movida)"
      : "The whole view changed (lighting or a moved camera)";
  const n = changes.regions.length;
  if (!n) return es ? "Sin cambios visibles" : "No visible changes";
  return es
    ? `${n} ${n === 1 ? "posible cambio" : "posibles cambios"}`
    : `${n} possible ${n === 1 ? "change" : "changes"}`;
}

/**
 * The notification after a batch of photos, or undefined when none of them
 * differs from its predecessor. One note per batch, naming each camera.
 */
export function changesNotification(
  photos: { cameraName: string; changes?: PhotoChanges | null }[],
  home: string,
  language: "en" | "es" = "en",
) {
  const differing = photos.filter(
    (p) => p.changes && (p.changes.scene || p.changes.regions.length),
  );
  if (!differing.length) return undefined;
  return {
    title:
      language === "es"
        ? `${home}: cambios en las fotos`
        : `${home}: changes in photos`,
    body: differing
      .map((p) => `${p.cameraName}: ${changeSummary(p.changes!, language)}`)
      .join("\n"),
  };
}
