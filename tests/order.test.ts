import { describe, expect, test } from "vitest";
import { inOrder, moveBeside, sortSensors } from "../src/shared/order";
import { planFloors, type MapProject } from "../src/shared/house-map";
import type { Device } from "../src/shared/model";

describe("sensor list ordering", () => {
  test("a saved order leads and unknown items keep their place after it", () => {
    expect(inOrder(["a", "b", "c", "d"], (k) => k, ["c", "a"])).toEqual([
      "c",
      "a",
      "b",
      "d",
    ]);
  });
  test("moving beside a neighbour keeps every other key", () => {
    expect(moveBeside(["a", "b", "c"], "c", "a", false)).toEqual([
      "c",
      "a",
      "b",
    ]);
    expect(moveBeside(["a", "b", "c"], "a", "b", true)).toEqual([
      "b",
      "a",
      "c",
    ]);
  });
  test("sensors of a type sit together, named in numeric order", () => {
    const d = (type: string, name: string) => ({ type, name });
    expect(
      sortSensors(
        [
          d("contact", "Ventana 10"),
          d("smoke", "Humo"),
          d("contact", "Ventana 2"),
          d("contact", "Puerta"),
          d("contact", "Ventana 1"),
        ],
        (x) => x.name,
      ).map((x) => x.name),
    ).toEqual(["Puerta", "Ventana 1", "Ventana 2", "Ventana 10", "Humo"]);
  });
});

describe("floor sections from the plans", () => {
  const room = (id: string, planId: string, name: string) => ({
    id,
    planId,
    label: name,
    center: [0.5, 0.5] as [number, number],
    windows: [],
    doors: [],
    matches: [{ room: [name] }],
  });
  const project: MapProject = {
    plans: [
      { id: "main", label: "Planta primera", width: 1, height: 1 },
      { id: "attic", label: "Planta bajo cubierta", width: 1, height: 1 },
    ],
    rooms: [
      room("a", "main", "Dormitorio 1"),
      room("b", "main", "Baño"),
      room("c", "attic", "Dormitorio 3"),
    ],
  };
  const device = (roomId: string, name: string) =>
    ({
      id: roomId,
      type: "contact",
      floorId: "f1",
      roomId,
      room: name,
    }) as Device;
  test("a room on another plan than most of its floor takes that plan's name", () => {
    expect(
      planFloors(
        [
          device("r1", "Dormitorio 1"),
          device("r2", "Baño"),
          device("r3", "Dormitorio 3"),
        ],
        project,
      ),
    ).toEqual({ [JSON.stringify(["f1", "r3"])]: "Planta bajo cubierta" });
  });
  test("a floor split evenly between plans is left alone", () => {
    expect(
      planFloors(
        [device("r1", "Dormitorio 1"), device("r3", "Dormitorio 3")],
        project,
      ),
    ).toEqual({});
  });
});
