import { describe, expect, it } from "vitest";
import { deviceTone, type Device } from "../src/shared/model";

const device = (extra: Partial<Device> = {}) =>
  ({
    id: "1",
    type: "MagneticContact",
    offline: false,
    batteryLow: false,
    closed: true,
    fetchedAt: "now",
    ...extra,
  }) as Device;

describe("sensor colour tone", () => {
  it("keeps a healthy closed contact out of the alert colours", () => {
    expect(deviceTone(device())).toBe("healthy");
  });
  it("marks an open contact as open even when the alarm is disarmed", () => {
    expect(deviceTone(device({ closed: false }))).toBe("open");
  });
  it("prefers open over a quieter health issue", () => {
    expect(deviceTone(device({ closed: false, batteryLow: true }))).toBe(
      "open",
    );
    expect(deviceTone(device({ batteryLow: true }))).toBe("attention");
  });
  it("escalates an open contact while fully armed, and an alarm above all", () => {
    expect(deviceTone(device({ closed: false }), { armed: true })).toBe(
      "open-armed",
    );
    expect(deviceTone(device({ closed: false, alarm: true }))).toBe("alarm");
  });
  it("does not trust a stale or offline reading", () => {
    expect(deviceTone(device({ closed: false }), { stale: true })).toBe(
      "unknown",
    );
    expect(deviceTone(device({ closed: false, offline: true }))).toBe(
      "unknown",
    );
  });
});
