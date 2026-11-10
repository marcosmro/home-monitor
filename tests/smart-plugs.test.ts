import { describe, expect, it } from "vitest";
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
