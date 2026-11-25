import { describe, expect, it } from "vitest";
import { logs } from "../src/shared/normalize";
import { smartPlugs } from "../src/shared/smart-plugs";
import { deviceHealth, deviceState, needsAttention } from "../src/shared/model";

describe("smart plug inventory", () => {
  it("preserves off as a valid state, without treating it as an inactive sensor", () => {
    const [plug] = smartPlugs(
      [
        {
          Id: "9",
          Label: "Porch",
          Status: "Off",
          TimerActive: false,
          Consumption: null,
        },
      ],
      "now",
    );
    expect(plug.id).toBe("smartplug:9");
    expect(deviceState(plug)).toBe("Off");
    expect(deviceHealth(plug)).toBe("Connected");
    expect(needsAttention(plug)).toBe(false);
    expect(plug.timerActive).toBe(false);
    expect(plug.room).toBe("Unassigned");
  });
  it.each(["Unreachable", "Disconnected"])(
    "flags %s without manufacturing an off state",
    (Status) => {
      const [plug] = smartPlugs([{ Id: 9, Status }], "now");
      expect(plug.plugState).toBe("unknown");
      expect(deviceHealth(plug)).toBe("Offline");
      expect(needsAttention(plug)).toBe(true);
    },
  );
  it("keeps missing and unfamiliar statuses unknown", () => {
    for (const Status of [undefined, "unexpected"]) {
      const [plug] = smartPlugs([{ Id: "9", Status }], "now");
      expect(deviceState(plug)).toBe("Unknown");
      expect(plug.offline).toBeUndefined();
    }
  });
  it("rejects malformed responses so refresh cannot erase last-known plugs", () => {
    expect(() => smartPlugs({}, "now")).toThrow("not recognized");
    expect(() => smartPlugs([{}], "now")).toThrow("not recognized");
    expect(smartPlugs([], "now")).toEqual([]);
  });
});

it("joins output records by their unique inventory label only", () => {
  const devices = smartPlugs(
    [
      { Id: 0, Label: "Luz 1" },
      { Id: 1, Label: "Luz 2" },
      { Id: 2, Label: "Duplicado" },
      { Id: 3, Label: "Duplicado" },
      { Id: 4 },
    ],
    "now",
  );
  const Records = [
    ["output_activated", "Luz 2"],
    ["output_deactivated", "Luz 1"],
    ["unlock", "Luz 1"],
    ["output_deactivated", "Duplicado"],
    ["output_activated", "Smart plug 4"],
    ["output_deactivated", null],
  ].map(([EventType, LockName]) => ({
    EventType,
    LockName,
    SensorInformation: null,
  }));
  expect(logs({ Records }, devices).map((e) => e.deviceId)).toEqual([
    "smartplug:1",
    "smartplug:0",
    undefined,
    undefined,
    undefined,
    undefined,
  ]);
});

it("switches the selected inventory slot with a bodyless POST and verifies its state", async () => {
  const { SectorApi } = await import("../src/main/api");
  const { Monitor } = await import("../src/main/service");
  let power = "Off";
  let apply = true;
  const writes: string[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const result = (v: unknown) => Response.json(v);
    if (url.pathname.endsWith("/Login"))
      return result({ AuthorizationToken: "session" });
    if (url.pathname.endsWith("GetPanelList"))
      return result([{ PanelId: "p" }]);
    if (url.pathname.endsWith("GetPanel"))
      return result({ Access: ["Smartplugs"] });
    if (url.pathname.endsWith("GetSmartplugStatus"))
      return result([{ Id: 0, Label: "Desk", Status: power }]);
    if (url.pathname.includes("/Turn")) {
      expect(init?.method).toBe("POST");
      expect(init?.body).toBeUndefined();
      expect(url.searchParams.get("panelId")).toBe("p");
      expect(url.searchParams.get("switchId")).toBe("0");
      writes.push(url.pathname);
      if (apply) power = url.pathname.includes("TurnOn") ? "On" : "Off";
      return new Response(null, { status: 204 });
    }
    return result({});
  };
  const monitor = new Monitor(
    new SectorApi({ hour: 0, used: 0, blockedUntil: 0 }, () => {}, fetcher),
    () => {},
  );
  await monitor.login("test", "test");
  await monitor.select("p");
  const send = (power: "on" | "off") =>
    monitor.setPlugPower("p", "smartplug:0", power);
  await expect(send("on")).rejects.toThrow("Enable live");
  monitor.readOnly(false);
  await expect(
    monitor.setPlugPower("other", "smartplug:0", "on"),
  ).rejects.toThrow();
  await expect(
    monitor.setPlugPower("p", "smartplug:7", "on"),
  ).rejects.toThrow();
  for (const power of ["on", "off"] as const) {
    const snap = await send(power);
    expect(snap.devices.find((d) => d.id === "smartplug:0")?.plugState).toBe(
      power,
    );
  }
  apply = false;
  await expect(send("on")).rejects.toThrow("could not be verified");
  expect(writes).toEqual([
    "/api/Panel/TurnOnSmartplug",
    "/api/Panel/TurnOffSmartplug",
    "/api/Panel/TurnOnSmartplug",
  ]);
});
