import { describe, it, expect, vi } from "vitest";
import reference from "./fixtures/reference-demo.json";
import { Monitor } from "../src/main/service";
import { ApiError, type SectorApi } from "../src/main/api";
import { legacyPlan, plan, mergeDevices } from "../src/shared/normalize";
import { InventoryReader } from "../src/main/inventory";

function replay(panelId: string, change: (p: any) => void = () => {}) {
  const p = structuredClone((reference.panels as Record<string, any>)[panelId]);
  change(p);
  const reads: string[] = [];
  const api = {
    used: 0,
    clear: vi.fn(),
    login: vi.fn(),
    request: vi.fn(async (path: string, body?: unknown) => {
      reads.push(path);
      if (path.includes("GetPanelList")) return reference.panelList;
      if (path.includes("GetPanel?")) return p.panel;
      if (path.endsWith("/state")) {
        if (p.state) return p.state;
        throw new ApiError("Unavailable", 404);
      }
      if (path.includes("GetPanelStatus?")) return p.status;
      if (path.includes("/logs?")) return p.logs;
      const key = path.endsWith("/doorsandwindows/propertyplan")
        ? "doorsPlan"
        : path.endsWith("/temperature")
          ? "temperaturePlan"
          : path.endsWith("/cameras/propertyplan")
            ? "camerasPlan"
            : path === "/api/housecheck/doorsandwindows"
              ? "doorsandwindows"
              : path === "/api/v2/housecheck/temperatures"
                ? "temperatures"
                : path.includes("GetTemperatures?")
                  ? "temperaturesLegacy"
                  : path === "/api/v2/housecheck/smokedetectors"
                    ? "smokedetectors"
                    : path === "/api/v2/housecheck/leakagedetectors"
                      ? "leakagedetectors"
                      : path.includes("/housecheck/cameras/")
                        ? "cameras"
                        : undefined;
      if (!key)
        throw new Error("Unapproved route in read-only replay: " + path);
      if (body) expect(body).toEqual({ PanelId: panelId });
      if (p[key] === undefined || p[key] === null)
        throw new ApiError("Unavailable", 404);
      return p[key];
    }),
  };
  return {
    p,
    api,
    reads,
    monitor: new Monitor(api as unknown as SectorApi, () => {}),
  };
}
async function connect(t: ReturnType<typeof replay>, id: string) {
  await t.monitor.login("fixture", "fixture");
  await t.monitor.select(id);
  return t.monitor.snap;
}
describe("replay of the working reference project’s synthetic raw responses", () => {
  it.each(["00012345", "00067890", "00099999"])(
    "loads reference property %s with real response normalizers and no security writes",
    async (id) => {
      const t = replay(id);
      const s = await connect(t, id);
      expect(s.devices.length).toBeGreaterThan(0);
      expect(s.warnings.contacts).toBeUndefined();
      expect(s.warnings.telemetry).toBeUndefined();
      if (id === "00067890")
        expect(Object.keys(s.warnings).sort()).toEqual([
          "cameras",
          "flood",
          "smoke",
        ]);
      else expect(s.warnings).toEqual({});
      expect(s.readOnly).toBe(true);
      expect(new Set(s.devices.map((d) => d.id)).size).toBe(s.devices.length);
    },
  );
  it.each([undefined, "sas", 1, "TC"])(
    "attempts modern sensors despite Vendor=%s",
    async (vendor) => {
      const t = replay("00099999", (p) => (p.panel.Vendor = vendor));
      const s = await connect(t, "00099999");
      expect(s.devices.length).toBeGreaterThan(10);
      expect(
        t.reads.some((x) => x.endsWith("/doorsandwindows/propertyplan")),
      ).toBe(true);
      expect(t.reads).not.toContain("/api/housecheck/doorsandwindows");
      expect(s.warnings).toEqual({});
    },
  );
  it("a legacy state endpoint does not disable modern inventory", async () => {
    const t = replay("00099999", (p) => delete p.state);
    const s = await connect(t, "00099999");
    expect(t.reads.some((x) => x.includes("GetPanelStatus"))).toBe(true);
    expect(t.reads.some((x) => x.endsWith("/temperature"))).toBe(true);
    expect(s.devices.length).toBeGreaterThan(10);
  });
  it("caches endpoint-specific 404 fallback without hiding other sources", async () => {
    const t = replay("00012345");
    const reader = new InventoryReader(
      t.api as unknown as SectorApi,
      "00012345",
    );
    await reader.contacts();
    await reader.contacts();
    expect(
      t.reads.filter((x) => x.endsWith("/doorsandwindows/propertyplan")),
    ).toHaveLength(1);
    expect(
      t.reads.filter((x) => x === "/api/housecheck/doorsandwindows"),
    ).toHaveLength(2);
  });
  it.each([401, 403, 429, 500])(
    "does not misclassify HTTP %s as legacy",
    async (status) => {
      const request = vi.fn().mockRejectedValue(new ApiError("Failed", status));
      const reader = new InventoryReader(
        { request } as unknown as SectorApi,
        "test",
      );
      await expect(reader.contacts()).rejects.toMatchObject({ status });
      expect(request).toHaveBeenCalledTimes(1);
    },
  );
  it("malformed modern state stays unknown rather than manufacturing a 404", async () => {
    const t = replay("00099999", (p) => (p.state = { isOnline: true }));
    const s = await connect(t, "00099999");
    expect(s.mode).toBe("unknown");
    expect(s.warnings.status).toContain("not recognized");
    expect(t.reads.some((x) => x.includes("GetPanelStatus"))).toBe(false);
    expect(s.devices.length).toBeGreaterThan(10);
  });
});
describe("legacy normalization without fabricated healthy flags", () => {
  it("reads both hierarchy families and translates known room keys", () => {
    const raw = {
      Floors: [
        {
          Name: "Ground floor",
          Key: "GROUND_FLOOR_PLACE",
          Rooms: [
            {
              Name: "Kitchen",
              Key: "KITCHEN_PLACE",
              Devices: [
                {
                  SerialString: "s",
                  Name: "Custom contact",
                  Closed: false,
                  LowBattery: true,
                },
              ],
            },
          ],
        },
      ],
    };
    const d = legacyPlan(
      raw,
      "contacts",
      "2026-11-09T10:00:00Z",
      "MagneticContact",
    )[0];
    expect(d.closed).toBe(false);
    expect(d.batteryLow).toBe(true);
    expect(d.offline).toBeUndefined();
    expect(d.roomEs).toBe("Cocina");
  });
  it("merges flat legacy temperatures without erasing contact location", () => {
    const c = legacyPlan(
      {
        Floors: [
          {
            Name: "Ground",
            Rooms: [
              {
                Name: "Kitchen",
                Devices: [
                  { SerialString: "s", Name: "Kitchen window", Closed: true },
                ],
              },
            ],
          },
        ],
      },
      "contacts",
      "2026-11-09T10:00:00Z",
      "MagneticContact",
    );
    const t = legacyPlan(
      [{ SerialNo: "s", Temprature: "21.5" }],
      "telemetry",
      "2026-11-09T10:01:00Z",
      "Temperature",
    );
    const d = mergeDevices(c, t)[0];
    expect(d.room).toBe("Kitchen");
    expect(d.type).toBe("MagneticContact");
    expect(d.temperature).toBe(21.5);
    expect(d.closed).toBe(true);
  });
  it("accepts the sections-only shape handled by the reference walker", () => {
    expect(
      plan(
        {
          sections: [
            {
              name: "Floor",
              places: [
                {
                  name: "Room",
                  components: [
                    { serialNumber: "s", typeName: "Keypad", info: {} },
                  ],
                },
              ],
            },
          ],
        },
        "telemetry",
        "2026-11-09T10:00:00Z",
      ),
    ).toHaveLength(1);
  });
});
