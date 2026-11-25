import { expect, it } from "vitest";
import { demoSnapshot } from "../src/shared/demo";
import { alertIsStale, type Device } from "../src/shared/model";
import { mergeDevices, plan } from "../src/shared/normalize";

const now = Date.parse("2026-11-23T19:10:00Z");
const current = new Date(now).toISOString();
const previous = new Date(now - 25 * 60_000).toISOString();

function readings(source: Device["source"], info: object, at: string) {
  const components = [{ serialNumber: "123", info }];
  return plan({ sections: [{ places: [{ components }] }] }, source, at);
}

it("keeps a freshly queried contact alert current when temperature polling fails", () => {
  const snap = {
    ...demoSnapshot(),
    statusAt: current,
    warnings: { telemetry: "timeout" },
  };
  const [d] = mergeDevices(
    readings("contacts", { alarm: true, closed: true }, current),
    readings("telemetry", { temperature: 16 }, previous).map((d) => ({
      ...d,
      stale: true,
    })),
  );
  expect(d.stale).toBe(true);
  expect(alertIsStale(d, snap, now)).toBe(false);
  expect(
    alertIsStale(d, { ...snap, warnings: { contacts: "timeout" } }, now),
  ).toBe(true);
  expect(alertIsStale(d, { ...snap, statusAt: previous }, now)).toBe(true);
  expect(alertIsStale(d, { ...snap, online: false }, now)).toBe(true);
  expect(alertIsStale({ ...d, offline: true }, snap, now)).toBe(true);
});

it("keeps an old alert old when another inventory succeeds", () => {
  const snap = { ...demoSnapshot(), statusAt: current };
  const [d] = mergeDevices(
    readings("contacts", { closed: true }, current),
    readings("telemetry", { alarm: true }, previous),
  );
  expect(d.alarmSource).toBe("telemetry");
  expect(alertIsStale(d, snap, now)).toBe(true);
});
