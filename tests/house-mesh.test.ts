import { it, expect } from "vitest";
import {
  buildHouseMesh,
  wallSegments,
  meshToObj,
  triangulate,
} from "../src/shared/house-mesh";
import type { MapPlan } from "../src/shared/house-map";
const plan: MapPlan = {
  id: "test",
  label: "Test",
  width: 100,
  height: 100,
  drawing: {
    bounds: [0, 0, 100, 100],
    areas: [
      {
        id: "room",
        label: "Room",
        points: [
          [0, 0],
          [100, 0],
          [100, 100],
          [0, 100],
        ],
        labelAt: [50, 50],
      },
    ],
    walls: ["M0,0 H100"],
    openings: [
      { id: "door", roomId: "room", kind: "door", a: [40, 0], b: [60, 0] },
    ],
    details: [],
  },
  model: { pixelsPerMetre: 10, defaultHeight: 2.7, notes: [], review: [] },
};
it("parses straight wall segments including relative commands and closes paths", () => {
  expect(wallSegments("M10,20 h30 v40 h-30 Z")).toEqual([
    [
      [10, 20],
      [40, 20],
    ],
    [
      [40, 20],
      [40, 60],
    ],
    [
      [40, 60],
      [10, 60],
    ],
    [
      [10, 60],
      [10, 20],
    ],
  ]);
  expect(() => wallSegments("M0,0 Q10,10 20,20")).toThrow("Unsupported");
});
it("leaves a physical doorway gap and includes a lintel in the full-height mesh", () => {
  const mesh = buildHouseMesh(plan);
  const acrossDoor = mesh.faces.filter(
    (f) =>
      f.kind === "wall" &&
      f.vertices.every((v) => v[0] >= 4 && v[0] <= 6) &&
      Math.min(...f.vertices.map((v) => v[0])) < 5 &&
      Math.max(...f.vertices.map((v) => v[0])) > 5,
  );
  expect(acrossDoor.length).toBeGreaterThan(0);
  expect(acrossDoor.every((f) => f.vertices.every((v) => v[1] >= 2.15))).toBe(
    true,
  );
  const cut = buildHouseMesh(plan, 2.7, true);
  expect(
    cut.faces
      .filter((f) => f.kind === "wall")
      .every((f) => f.vertices.every((v) => v[1] <= 0.85)),
  ).toBe(true);
});
it("keeps voids open, models raised floors, and exports finite metre coordinates", () => {
  const raised = structuredClone(plan);
  raised.model!.areaLevels = { room: 2.25 };
  raised.drawing!.areas.push({
    id: "void",
    label: "Void",
    points: [
      [110, 0],
      [120, 0],
      [120, 10],
    ],
    labelAt: [115, 5],
    kind: "void",
  });
  const mesh = buildHouseMesh(raised);
  expect(mesh.faces.filter((f) => f.kind === "floor")).toHaveLength(1);
  expect(
    mesh.faces
      .find((f) => f.kind === "floor")!
      .vertices.every((v) => v[1] === 2.25),
  ).toBe(true);
  expect(meshToObj(mesh)).toContain("v 10.00000 2.25000 10.00000");
  expect(meshToObj(mesh)).not.toMatch(/NaN|Infinity/);
});

it("follows sloped wall caps and includes optional roofs, railings and supports in full exports", () => {
  const detail = structuredClone(plan);
  detail.model!.ceilingProfiles = [
    { areaId: "room", axis: "x", start: 0, end: 100, low: 2.2, high: 3.4 },
  ];
  detail.model!.surfaces = [
    {
      label: "Test pitched roof",
      points: [
        [0, 2.2, 0],
        [100, 3.4, 0],
        [100, 3.4, 100],
        [0, 2.2, 100],
      ],
      kind: "roof",
      color: "#aaaaaa",
    },
  ];
  detail.model!.rails = [
    { a: [0, 0, 10], b: [100, 1, 10], height: 1, style: "glass" },
  ];
  detail.model!.posts = [
    { point: [20, 20], base: 0, top: 2, width: 0.1, color: "#999999" },
  ];
  const open = buildHouseMesh(detail);
  expect(open.faces.some((f) => f.kind === "roof")).toBe(false);
  expect(
    open.faces
      .filter((f) => f.kind === "wall")
      .flatMap((f) => f.vertices)
      .some((v) => v[0] === 10 && v[1] === 3.4),
  ).toBe(true);
  const complete = buildHouseMesh(detail, 2.7, false, true);
  for (const kind of ["roof", "railing", "support"])
    expect(complete.faces.some((f) => f.kind === kind)).toBe(true);
  expect(meshToObj(complete)).not.toMatch(/NaN|Infinity/);
});

it("cuts two vertically separated glazed openings without filling either with a solid wall", () => {
  const detail = structuredClone(plan);
  detail.drawing!.openings = [
    {
      id: "lower",
      roomId: "room",
      kind: "window",
      a: [40, 0],
      b: [60, 0],
      sill: 0.6,
      head: 1.2,
      panes: 2,
    },
    {
      id: "upper",
      roomId: "room",
      kind: "window",
      a: [40, 0],
      b: [60, 0],
      sill: 1.8,
      head: 2.2,
      panes: 3,
    },
  ];
  const mesh = buildHouseMesh(detail);
  expect(mesh.faces.filter((f) => f.kind === "glazing")).toHaveLength(2);
  expect(mesh.faces.some((f) => f.kind === "frame")).toBe(true);
  const middle = mesh.faces.filter(
    (f) =>
      f.kind === "wall" &&
      Math.min(...f.vertices.map((v) => v[0])) < 5 &&
      Math.max(...f.vertices.map((v) => v[0])) > 5,
  );
  for (const face of middle) {
    const min = Math.min(...face.vertices.map((v) => v[1])),
      max = Math.max(...face.vertices.map((v) => v[1]));
    expect(min >= 1.2 || max <= 0.6).toBe(true);
    expect(min >= 2.2 || max <= 1.8).toBe(true);
  }
});

it("triangulates concave floor outlines without filling their recess", () => {
  const points: [number, number, number][] = [
    [0, 0, 0],
    [3, 0, 0],
    [3, 0, 1],
    [1, 0, 1],
    [1, 0, 3],
    [0, 0, 3],
  ];
  const triangles = triangulate(points);
  expect(triangles).toHaveLength(4);
  const area = triangles.reduce(
    (sum, [a, b, c]) =>
      sum +
      Math.abs((b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0])) /
        2,
    0,
  );
  expect(area).toBe(5);
});

it("keeps exterior labels over custom sloping terrain without duplicate flat floors", () => {
  const site: MapPlan = {
    ...plan,
    drawing: { ...plan.drawing!, walls: [], openings: [] },
    model: {
      ...plan.model!,
      scene: "exterior",
      excludedAreas: ["room"],
      areaLevels: { room: -2 },
      surfaces: [
        {
          label: "Slope",
          kind: "terrain",
          color: "#aabb99",
          points: [
            [0, -2, 0],
            [100, -2, 0],
            [100, 0, 100],
            [0, 0, 100],
          ],
        },
      ],
    },
  };
  const mesh = buildHouseMesh(site);
  expect(mesh.faces).toHaveLength(1);
  expect(mesh.faces[0].vertices).toEqual([
    [0, -2, 0],
    [10, -2, 0],
    [10, 0, 10],
    [0, 0, 10],
  ]);
  expect(mesh.labels).toEqual([{ text: "Room", point: [5, -2, 5] }]);
  expect(meshToObj(mesh)).not.toMatch(/NaN|Infinity/);
});
