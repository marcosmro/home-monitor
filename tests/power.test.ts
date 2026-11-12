import { describe, it, expect } from "vitest";
import {
  PowerWatcher,
  formatMinutes,
  outageMinutes,
  powerKind,
  powerNotification,
  powerStatus,
} from "../src/shared/power";
import { demoSnapshot } from "../src/shared/demo";
import type { Event, Snapshot } from "../src/shared/model";
const event = (type: string, time?: string, localTime?: string): Event => ({
  id: `${type}-${time || localTime}`,
  type,
  description: type,
  time,
  localTime,
});
const lost = event("mains", "2026-11-09T01:13:00.000Z");
const back = event("mainsrestore", "2026-11-09T02:40:00.000Z");
const live = (events: Event[], panelId = "p1"): Snapshot => ({
  ...demoSnapshot(),
  demo: false,
  panelId,
  name: "Casa",
  events,
});
describe("mains power status", () => {
  it("recognizes the server's mixed spellings and nothing else", () => {
    expect(powerKind("mains")).toBe("lost");
    expect(powerKind("mains_restored")).toBe("restored");
    expect(powerKind("mainsrestore")).toBe("restored");
    expect(powerKind("Mains-Restored")).toBe("restored");
    expect(powerKind("internet_lost")).toBeUndefined();
    expect(powerKind("low-battery")).toBeUndefined();
  });
  it("reports nothing when the history has no mains event", () => {
    expect(powerStatus(demoSnapshot().events)).toBeUndefined();
  });
  it("reports an ongoing outage when the latest mains event is a failure", () => {
    const s = powerStatus([event("armed", "2026-11-09T03:00:00.000Z"), lost]);
    expect(s).toMatchObject({ state: "out", lost: { time: lost.time } });
    // An older restoration does not cancel a newer failure, in any order.
    const older = event("mains_restored", "2026-11-01T00:00:00.000Z");
    expect(powerStatus([older, lost])?.state).toBe("out");
  });
  it("pairs a restoration with its failure and measures the outage", () => {
    const s = powerStatus([back, lost])!;
    expect(s.state).toBe("restored");
    expect(s.lost?.time).toBe(lost.time);
    expect(outageMinutes(s)).toBe(87);
    expect(formatMinutes(87)).toBe("1 h 27 min");
    expect(formatMinutes(60)).toBe("1 h");
    expect(formatMinutes(5)).toBe("5 min");
  });
  it("keeps a restoration whose failure is no longer in the history", () => {
    const s = powerStatus([back])!;
    expect(s).toMatchObject({ state: "restored", lost: undefined });
    expect(outageMinutes(s)).toBeUndefined();
  });
  it("falls back to history order for offsetless legacy times", () => {
    const s = powerStatus([
      event("mains_restored", undefined, "2026-11-09T03:40:00"),
      event("mains", undefined, "2026-11-09T02:13:00"),
    ])!;
    expect(s.state).toBe("restored");
    expect(s.key).toBe("restored@2026-11-09T03:40:00");
    expect(outageMinutes(s)).toBeUndefined();
  });
  it("words notifications in both languages", () => {
    const out = powerNotification(powerStatus([lost])!, "Casa");
    expect(out.title).toBe("Power outage at Casa");
    expect(out.body).toContain("2026-11-09 · 02:13:00");
    const restored = powerNotification(
      powerStatus([back, lost])!,
      "Casa",
      "es",
    );
    expect(restored.title).toBe("Ha vuelto la luz en Casa");
    expect(restored.body).toContain("1 h 27 min");
  });
});
describe("power notifications", () => {
  it("never alerts for demo data or before the history has loaded", () => {
    const w = new PowerWatcher();
    expect(w.check({ ...demoSnapshot(), events: [lost] })).toBeUndefined();
    expect(w.check({ ...live([lost]), eventsAt: undefined })).toBeUndefined();
  });
  it("alerts on first load only when the power is out right now", () => {
    expect(new PowerWatcher().check(live([back, lost]))).toBeUndefined();
    expect(new PowerWatcher().check(live([lost]))?.state).toBe("out");
  });
  it("alerts once per new mains event", () => {
    const w = new PowerWatcher();
    expect(w.check(live([]))).toBeUndefined();
    expect(w.check(live([lost]))?.state).toBe("out");
    expect(w.check(live([lost]))).toBeUndefined();
    // Unrelated new activity shifts the history without re-alerting.
    expect(
      w.check(live([event("armed", "2026-11-09T01:30:00.000Z"), lost])),
    ).toBeUndefined();
    expect(w.check(live([back, lost]))?.state).toBe("restored");
    expect(w.check(live([back, lost]))).toBeUndefined();
  });
  it("treats another property as a new baseline", () => {
    const w = new PowerWatcher();
    w.check(live([]));
    expect(w.check(live([back, lost], "p2"))).toBeUndefined();
  });
});
