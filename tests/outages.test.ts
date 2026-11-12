import { describe, it, expect } from "vitest";
import {
  OutageLog,
  inferredMinutes,
  inferredNotification,
  reachability,
  validOutageFile,
} from "../src/shared/outages";
import { demoSnapshot } from "../src/shared/demo";
import type { Device, Snapshot } from "../src/shared/model";
const at = (minute: number) =>
  new Date(Date.UTC(2026, 10, 9, 1, minute)).toISOString();
const plug = (id: string, offline: boolean | undefined, time: string) =>
  ({
    id: `smartplug:${id}`,
    original: id,
    type: "SmartPlug",
    floorId: "unassigned",
    floor: "",
    roomId: "unassigned",
    room: "",
    offline,
    fetchedAt: time,
    source: "smartplugs",
  }) as Device;
const live = (
  minute: number,
  plugs: Array<boolean | undefined>,
  extra: Partial<Snapshot> = {},
): Snapshot => ({
  ...demoSnapshot(),
  demo: false,
  panelId: "p1",
  online: true,
  statusAt: at(minute),
  events: [],
  devices: plugs.map((offline, i) => plug(String(i), offline, at(minute))),
  ...extra,
});
describe("reachability evidence", () => {
  it("needs every plug unreachable, not just some", () => {
    expect(reachability(live(0, [true, false])).down).toEqual([]);
    expect(reachability(live(0, [true, true])).down).toEqual(["plugs"]);
  });
  it("ignores plugs with no reported state and failed refreshes", () => {
    expect(reachability(live(0, [undefined, true])).down).toEqual(["plugs"]);
    const failed = live(0, [true], {
      warnings: { smartplugs: "x", status: "x" },
    });
    expect(reachability(failed)).toMatchObject({ known: false, down: [] });
  });
  it("counts an offline panel and adds internet loss only as support", () => {
    const lost = {
      id: "i",
      type: "internet_lost",
      description: "",
      time: at(1),
    };
    expect(reachability(live(0, [], { online: false })).down).toEqual([
      "panel",
    ]);
    expect(reachability(live(0, [false], { events: [lost] })).down).toEqual([]);
    expect(reachability(live(0, [true], { events: [lost] })).down).toEqual([
      "plugs",
      "internet",
    ]);
  });
});
describe("inferred power-cut log", () => {
  it("records a cut from first unreachable check to first reachable one", () => {
    const log = new OutageLog();
    const events: string[] = [];
    let saves = 0;
    log.onEvent = (kind) => events.push(kind);
    log.onChange = () => saves++;
    expect(log.update(live(0, [false, false]))).toEqual([]);
    log.update(live(15, [true, true]));
    log.update(live(30, [true, true]));
    // Repeating the same evidence neither saves nor alerts again.
    const before = saves;
    log.update(live(30, [true, true]));
    expect(saves).toBe(before);
    const [cut] = log.update(live(45, [false, false]));
    expect(cut).toEqual({
      startedAt: at(15),
      lastOkAt: at(0),
      lastDownAt: at(30),
      endedAt: at(45),
      signals: ["plugs"],
    });
    expect(inferredMinutes(cut)).toBe(30);
    expect(events).toEqual(["started", "ended"]);
  });
  it("holds an ongoing cut open while our own connection fails", () => {
    const log = new OutageLog();
    log.update(live(0, [true]));
    const stale = live(20, [false], {
      warnings: { smartplugs: "x", status: "x" },
    });
    expect(log.update(stale)[0].endedAt).toBeUndefined();
  });
  it("keeps properties separate and never records demo data", () => {
    const log = new OutageLog();
    log.update(live(0, [true]));
    expect(log.update(live(0, [false], { panelId: "p2" }))).toEqual([]);
    expect(log.update({ ...live(0, [true]), demo: true })).toEqual([]);
    expect(Object.keys(log.data.panels)).toEqual(["p1", "p2"]);
  });
  it("discards malformed saved logs", () => {
    expect(validOutageFile(null)).toEqual({ panels: {} });
    expect(validOutageFile({ panels: { p: { outages: "x" } } })).toEqual({
      panels: {},
    });
    const good = {
      startedAt: at(0),
      lastDownAt: at(0),
      signals: ["plugs"],
    };
    const file = validOutageFile({
      panels: {
        p: { lastOkAt: "nope", outages: [good, { startedAt: "bad" }] },
      },
    });
    expect(file.panels.p).toEqual({ lastOkAt: undefined, outages: [good] });
  });
  it("words notifications in both languages", () => {
    const cut = {
      startedAt: at(15),
      lastDownAt: at(30),
      endedAt: at(45),
      signals: ["plugs" as const],
    };
    const started = inferredNotification("started", cut, "Casa");
    expect(started.title).toBe("Possible power cut at Casa");
    expect(started.body).toContain("All smart plugs became unreachable");
    const ended = inferredNotification("ended", cut, "Casa", "es");
    expect(ended.title).toBe("Fin del posible corte de luz en Casa");
    expect(ended.body).toContain("30 min");
  });
});
