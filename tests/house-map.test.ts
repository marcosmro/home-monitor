import { it, expect } from "vitest";
import { demoSnapshot } from "../src/shared/demo";
import { demoMap } from "../src/shared/demo-map";
import {
  bestGrid,
  floorPlans,
  suggestPlacements,
  validatePlacement,
} from "../src/shared/house-map";
import { defaults } from "../src/shared/model";
import { HouseMapStore } from "../src/main/house-map";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
it("suggests each matching sensor without claiming confirmed mounting positions", () => {
  const ds = demoSnapshot().devices,
    p = demoMap(),
    locations = suggestPlacements(ds, p);
  expect(Object.keys(locations)).toHaveLength(48);
  expect(
    Object.values(locations).every(
      (v) => !v.confirmed && v.x >= 0 && v.x <= 1 && v.y >= 0 && v.y <= 1,
    ),
  ).toBe(true);
});
it("uses opening candidates for known window mounts, and leaves ambiguous rooms unplaced", () => {
  const p = demoMap(),
    d = { ...demoSnapshot().devices[0], mount: "window" as const };
  const location = suggestPlacements([d], p)[d.id];
  expect([location.x, location.y]).toEqual(p.rooms[0].windows[0]);
  p.rooms.push({ ...p.rooms[0], id: "duplicate" });
  expect(suggestPlacements([d], p)[d.id]).toBeUndefined();
});
it("validates coordinates, room-plan association, and normalizes local confirmation", () => {
  const p = demoMap(),
    base = {
      planId: p.plans[0].id,
      x: 0.5,
      y: 0.5,
      confirmed: false,
      reason: "arbitrary",
    };
  expect(validatePlacement(base, p)).toMatchObject({ confirmed: true });
  expect(() => validatePlacement({ ...base, x: NaN }, p)).toThrow("Invalid");
  expect(() => validatePlacement({ ...base, x: 1.1 }, p)).toThrow("Invalid");
  expect(() =>
    validatePlacement({ ...base, roomId: p.rooms[5].id }, p),
  ).toThrow("Invalid");
  expect(validatePlacement(null, p)).toBeNull();
});
it("persists concurrent edits and removal across restarts without leaking to another property", async () => {
  const root = await mkdtemp(join(tmpdir(), "home-map-"));
  try {
    await writeFile(join(root, "project.json"), JSON.stringify(demoMap()));
    const store = new HouseMapStore(root),
      p = { planId: "f0", x: 0.2, y: 0.3, confirmed: true, reason: "test" };
    await Promise.all([
      store.save("live:a", "one", p),
      store.save("live:a", "two", p),
    ]);
    await store.save("live:a", "one", null);
    const next = new HouseMapStore(root);
    expect((await next.load("live:a")).placements).toMatchObject({
      one: null,
      two: { x: 0.2, y: 0.3, confirmed: true },
    });
    expect((await next.load("live:b")).placements).toEqual({});
    await expect(next.image("../credentials.secure")).rejects.toThrow(
      "Unknown",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("uses photo hints only for the matching camera and preserves editable direction", () => {
  const project = demoMap();
  const camera = demoSnapshot().devices.find((d) => d.type === "CameraPIR")!;
  project.cameraHints = [
    {
      deviceId: camera.id,
      roomId: project.rooms[0].id,
      point: [0.21, 0.32],
      heading: 125,
      confidence: "medium",
      evidence: "Two window walls identify this corner.",
    },
  ];
  expect(suggestPlacements([camera], project)[camera.id]).toMatchObject({
    x: 0.21,
    y: 0.32,
    heading: 125,
    confirmed: false,
  });
  const placed = suggestPlacements([camera], project)[camera.id];
  expect(validatePlacement(placed, project)).toMatchObject({
    heading: 125,
    confirmed: true,
  });
  expect(() =>
    validatePlacement({ ...placed, heading: Infinity }, project),
  ).toThrow("Invalid");
  expect(() => validatePlacement({ ...placed, heading: 360 }, project)).toThrow(
    "Invalid",
  );
  const other = { ...camera, type: "MagneticContact" };
  expect(suggestPlacements([other], project)[other.id].heading).toBeUndefined();
});
it("names, orders and counts plans like the sensor list, whatever the plan files are called", () => {
  const ds = demoSnapshot().devices,
    p = demoMap();
  p.plans.forEach((plan) => (plan.label = `Plan file ${plan.id}`));
  p.plans.push({ ...p.plans[0], id: "spare", label: "Spare plan" });
  // The first room of the basement is drawn on the ground-floor plan.
  p.rooms.find((r) => r.id === "f2r0")!.planId = "f0";
  const prefs = {
    ...defaults,
    floorOrder: ["Sótano", "Primera planta", "Planta baja"],
  };
  const plans = floorPlans(p, ds, suggestPlacements(ds, p), prefs);
  expect(plans.map((x) => [x.plan.id, x.title, x.devices.length])).toEqual([
    ["f2", "Sótano", 16],
    ["f1", "Primera planta", 16],
    ["f0", "Planta baja", 16],
    ["spare", "Spare plan", 0],
  ]);
  // Two floor sections on one plan: the plan carries both names.
  const merged = floorPlans(
    p,
    ds,
    Object.fromEntries(
      ds.map((d) => [
        d.id,
        { planId: "f0", x: 0.5, y: 0.5, confirmed: true, reason: "" },
      ]),
    ),
    prefs,
  );
  expect(merged[0].title).toBe("Sótano · Primera planta · Planta baja");
  expect(merged[0].devices).toHaveLength(48);
});
it("arranges plan cards to draw them largest in the space there is", () => {
  const portrait: [number, number][] = Array(4).fill([600, 1000]);
  // A tall panel: 2 by 2 instead of a thin row over empty space.
  expect(bestGrid(portrait, { width: 640, height: 900 })).toEqual({
    cols: 2,
    rows: 2,
  });
  // A wide, short one: a single row.
  expect(bestGrid(portrait, { width: 1200, height: 400 })).toEqual({
    cols: 4,
    rows: 1,
  });
  // Too little room for any arrangement: the cards scroll instead.
  expect(bestGrid(portrait, { width: 300, height: 120 })).toBeUndefined();
});
