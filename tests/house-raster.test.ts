import { expect, it } from "vitest";
import { rasterizeHouse } from "../src/renderer/src/house-raster";
import type { MeshFace } from "../src/shared/house-mesh";
it("resolves overlapping facade panels by per-pixel depth independent of face order", () => {
  const wall: MeshFace = {
    kind: "wall",
    color: "#aabbcc",
    vertices: [
      [0, 0, 0],
      [8, 0, 0],
      [8, 8, 0],
      [0, 8, 0],
    ],
  };
  const window: MeshFace = {
    kind: "wall",
    color: "#224466",
    vertices: [
      [2, 2, 0.01],
      [6, 2, 0.01],
      [6, 6, 0.01],
      [2, 6, 0.01],
    ],
  };
  const a = rasterizeHouse(
    { faces: [window, wall], labels: [] },
    (v) => v,
    10,
    10,
  );
  const b = rasterizeHouse(
    { faces: [wall, window], labels: [] },
    (v) => v,
    10,
    10,
  );
  expect(a).toEqual(b);
  expect([...a.slice((4 * 10 + 4) * 4, (4 * 10 + 4) * 4 + 4)]).toEqual([
    34, 68, 102, 255,
  ]);
  expect([...a.slice((1 * 10 + 1) * 4, (1 * 10 + 1) * 4 + 4)]).toEqual([
    170, 187, 204, 255,
  ]);
  expect(a[(9 * 10 + 9) * 4 + 3]).toBe(0);
});
