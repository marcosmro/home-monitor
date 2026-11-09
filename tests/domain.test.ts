import { describe, it, expect } from "vitest";
import { state, plan, mergeDevices, logs } from "../src/shared/normalize";
import { madrid, instant, eventTime } from "../src/shared/time";
import { demoSnapshot } from "../src/shared/demo";
import {
  defaults,
  displayDevice,
  location,
  deviceHealth,
  deviceState,
} from "../src/shared/model";
import { CommandGate } from "../src/shared/commands";
const raw = (info: any, name = "Custom name") => ({
  areas: [
    {
      id: 7,
      sections: [
        {
          id: "f",
          name: "Ground floor",
          translationKey: "GROUND_FLOOR_PLACE",
          places: [
            {
              id: "r",
              name: "Kitchen",
              translationKey: "KITCHEN_PLACE",
              components: [
                {
                  serialNumber: "123",
                  name,
                  typeName: "MagneticContact",
                  info,
                },
              ],
            },
          ],
        },
      ],
    },
  ],
});
describe("sensor normalization", () => {
  it("does not invent missing health or activity", () => {
    const d = plan(raw({}), "contacts", "2026-01-01T00:00:00Z")[0];
    expect(deviceHealth(d)).toBe("Unknown");
    expect(deviceState(d)).toBe("Not reported");
    expect(d.batteryLow).toBeUndefined();
  });
  it("merges physical devices without losing contact state or falsely refreshing source time", () => {
    const c = plan(
      raw({ closed: false, alarm: false, lastChanged: "2026-01-01T00:00:00Z" }),
      "contacts",
      "2026-01-01T00:00:00Z",
    );
    const t = plan(
      raw({ supervision: true, batteryLow: false }),
      "telemetry",
      "2026-01-01T00:15:00Z",
    );
    const ds = mergeDevices(c, t);
    expect(ds).toHaveLength(1);
    expect(ds[0].fetchedAt).toBe("2026-01-01T00:00:00Z");
    expect(ds[0].closed).toBe(false);
    expect(ds[0].changedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(deviceHealth(ds[0])).toBe("Offline");
    expect(deviceState(ds[0])).toBe("Last known");
  });
  it("preserves user names and translates only documented place keys", () => {
    const d = plan(raw({}), "contacts", "now")[0];
    expect(d.original).toBe("Custom name");
    expect(d.spanish).toBeUndefined();
    expect(d.roomEs).toBe("Cocina");
    expect(displayDevice(d, defaults)).toBe("Custom name");
  });
  it("persists aliases by stable ID and preserves accents, long names and original fallback", () => {
    const d = demoSnapshot().devices[0];
    const p = {
      ...defaults,
      aliases: {
        [d.id]: {
          spanish: "Ventana de la habitación de invitados — jardín",
          room: "Habitación de José",
        },
      },
    };
    expect(displayDevice(d, p)).toContain("jardín");
    expect(location(d, p).room).toContain("José");
    expect(
      displayDevice({ ...d, spanish: undefined }, { ...defaults, aliases: {} }),
    ).toBe(d.original);
  });
  it("rejects an invalid plan instead of converting errors into an empty healthy house", () => {
    expect(() => plan({}, "contacts", "now")).toThrow();
  });
  it("distinguishes unknown connectivity and multiple-area mixed modes", () => {
    expect(
      state({ areas: [{ id: 9, state: "ArmedTotal" }] }).online,
    ).toBeUndefined();
    expect(
      state({
        areas: [
          { id: 2, state: "ArmedTotal" },
          { id: 5, state: "Disarmed" },
        ],
      }).mode,
    ).toBe("unknown");
  });
  it("has a realistic inventory with independent activity and health", () => {
    const s = demoSnapshot();
    expect(s.devices).toHaveLength(48);
    expect(new Set(s.devices.map((d) => d.id)).size).toBe(48);
    expect(new Set(s.devices.map((d) => d.floorId)).size).toBe(3);
    expect(s.devices.some((d) => d.closed === false && !d.batteryLow)).toBe(
      true,
    );
  });
});
describe("Madrid timestamps", () => {
  it("handles spring DST jump", () => {
    expect(madrid("2026-03-29T00:59:00Z")).toBe("01:59:00");
    expect(madrid("2026-03-29T01:00:00Z")).toBe("03:00:00");
  });
  it("handles fall DST fold without assuming an offset", () => {
    expect(madrid("2026-10-25T00:30:00Z")).toBe("02:30:00");
    expect(madrid("2026-10-25T01:30:00Z")).toBe("02:30:00");
  });
  it("does not double-convert source offsets", () => {
    expect(madrid("2026-11-09T19:00:00+01:00", true)).toBe(
      "2026-11-09 · 19:00:00",
    );
  });
  it("never interprets a naive source time in the computer timezone", () => {
    expect(instant("2026-10-25T02:30:00")).toBeUndefined();
    const e = logs({
      Records: [{ Time: "2026-10-25T02:30:00", EventType: "disarmed" }],
    })[0];
    expect(e.time).toBeUndefined();
    expect(eventTime(e)).toContain("offset unavailable");
  });
  it("retains unknown event types and never invents actors", () => {
    const e = logs({ Records: [{ EventType: "new_event" }] })[0];
    expect(e.description).toBe("new_event");
    expect(e.user).toBeUndefined();
  });
});
describe("command guard", () => {
  it("prevents duplicate and conflicting submissions", () => {
    const g = new CommandGate();
    g.begin("disarm", 7);
    expect(() => g.begin("arm", 7)).toThrow();
    g.phase = "unknown";
    expect(() => g.begin("disarm", 7)).toThrow();
  });
  it("requires the requested mode and a connected system", () => {
    const g = new CommandGate();
    g.begin("arm", 7);
    expect(g.confirm("armed", false)).toBe(false);
    expect(g.phase).toBe("unknown");
    expect(g.confirm("armed", true)).toBe(true);
  });
});

describe("reliable device references in events", () => {
  it("resolves only unique complete documented sensor identity tuples", () => {
    const p = raw({});
    const floor = p.areas[0].sections[0];
    const room = floor.places[0];
    Object.assign(room, { placeNumber: 7 });
    Object.assign(room.components[0], { mountType: "WINDOW", mountIndex: 2 });
    const devices = plan(p, "contacts", "2026-01-01T00:00:00Z");
    const history = {
      Records: [
        {
          EventType: "low-battery",
          SensorInformation: {
            DeviceType: "MagneticContact",
            MountType: "WINDOW",
            MountIndex: 2,
            SectionKey: "GROUND_FLOOR_PLACE",
            PlaceKey: "KITCHEN_PLACE",
            PlaceIndex: 7,
          },
        },
      ],
    };
    expect(logs(history, devices)[0].deviceId).toBe("123");
    expect(
      logs(history, [...devices, { ...devices[0], id: "duplicate" }])[0]
        .deviceId,
    ).toBeUndefined();
    expect(
      logs({ Records: [{ EventType: "low-battery" }] }, devices)[0].deviceId,
    ).toBeUndefined();
  });
});

describe("reference alarm state variants", () => {
  it.each([
    ["Armed", "armed"],
    ["armed_total", "armed"],
    ["3", "armed"],
    ["ArmedHome", "partial"],
    ["2", "partial"],
    ["disarmed", "disarmed"],
    ["1", "disarmed"],
  ])("normalizes %s without defaulting unknown values", (raw, expected) => {
    expect(
      state({ isOnline: true, areas: [{ id: "7", state: raw }] }).areas[0],
    ).toMatchObject({ id: 7, mode: expected, reportedMode: raw });
  });
  it("does not substitute an array index for a missing area ID", () => {
    expect(state({ areas: [{ state: "Armed" }] }).areas).toEqual([]);
    expect(state({ areas: [{ id: 7, state: "unrecognized" }] }).mode).toBe(
      "unknown",
    );
  });
});

describe("Spanish names from documented generic device metadata", () => {
  it("labels generic contacts by the reported mount and index", () => {
    const p = raw({}, "Contact and Shock Detector");
    Object.assign(p.areas[0].sections[0].places[0].components[0], {
      mountType: "WINDOW",
      mountIndex: 2,
    });
    const d = plan(p, "contacts", "2026-11-09T10:00:00Z")[0];
    expect(d.spanish).toBe("Ventana 2");
    const telemetry = plan(
      raw({}, "Contact and Shock Detector"),
      "telemetry",
      "2026-11-09T10:01:00Z",
    );
    expect(mergeDevices([d], telemetry)[0].spanish).toBe("Ventana 2");
    expect(d.original).toBe("Contact and Shock Detector");
  });
  it("never replaces a meaningful user name merely containing a generic type", () => {
    const d = plan(
      raw({}, "Kitchen — contact and shock detector José"),
      "contacts",
      "2026-11-09T10:00:00Z",
    )[0];
    expect(d.spanish).toBeUndefined();
    expect(displayDevice(d, defaults)).toContain("José");
  });
});

describe("documented MountTypeDto representations", () => {
  it.each([
    [0, "Puerta 2", "door"],
    [1, "Ventana 2", "window"],
    ["WINDOW", "Ventana 2", "window"],
    ["Door", "Puerta 2", "door"],
  ])("uses reported mount %s", (mount, label, kind) => {
    const p = raw({}, "Contact and Shock Detector");
    Object.assign(p.areas[0].sections[0].places[0].components[0], {
      mountType: mount,
      mountIndex: 2,
    });
    const d = plan(p, "contacts", "2026-11-09T10:00:00Z")[0];
    expect(d.spanish).toBe(label);
    expect(d.mount).toBe(kind);
    expect(d.mountIndex).toBe(2);
    expect(d.reportedMount).toBe(mount);
    expect(
      mergeDevices([d], plan(raw({}), "telemetry", "2026-11-09T10:01:00Z"))[0]
        .mount,
    ).toBe(kind);
  });
  it("does not treat absent, null, or unknown mount values as doors", () => {
    for (const mount of [undefined, null, 9, "unknown"]) {
      const p = raw({}, "Contact and Shock Detector");
      Object.assign(p.areas[0].sections[0].places[0].components[0], {
        mountType: mount,
      });
      expect(plan(p, "contacts", "now")[0].mount).toBeUndefined();
    }
  });
});
