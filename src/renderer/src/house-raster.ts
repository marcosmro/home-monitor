import {
  triangulate,
  type HouseMesh,
  type Vec3,
} from "../../shared/house-mesh";

// Orthographic software depth buffer for overlapping exterior walls and facade panels.
// Geometry stays local; no WebGL requirement or network textures.
export function rasterizeHouse(
  mesh: HouseMesh,
  project: (v: Vec3) => number[],
  width: number,
  height: number,
) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  const depth = new Float64Array(width * height).fill(-Infinity);
  for (const face of mesh.faces) {
    const rgb = face.color
      .match(/[\da-f]{2}/gi)
      ?.map((c) => parseInt(c, 16)) || [180, 190, 180];
    for (const triangle of triangulate(face.vertices)) {
      const [a, b, c] = triangle.map(project);
      const denom =
        (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
      if (Math.abs(denom) < 1e-8) continue;
      const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))),
        x1 = Math.min(width - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
      const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))),
        y1 = Math.min(height - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const px = x + 0.5,
            py = y + 0.5;
          const u =
            ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (py - c[1])) / denom;
          const v =
            ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (py - c[1])) / denom;
          const w = 1 - u - v;
          if (u < -1e-8 || v < -1e-8 || w < -1e-8) continue;
          const z = u * a[2] + v * b[2] + w * c[2],
            i = y * width + x;
          if (z < depth[i] - 1e-7) continue;
          depth[i] = z;
          pixels[i * 4] = rgb[0];
          pixels[i * 4 + 1] = rgb[1];
          pixels[i * 4 + 2] = rgb[2];
          pixels[i * 4 + 3] = 255;
        }
    }
  }
  return pixels;
}
