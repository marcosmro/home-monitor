import { expect, it } from "vitest";
import { demoSnapshot } from "../src/shared/demo";
import { dayTimeline } from "../src/shared/day-timeline";
import type { Event } from "../src/shared/model";
const day = "2026-11-24";
const at = (stamp: string) => Date.parse(stamp);
const ev = (type: string, time: string, deviceId?: string): Event => ({
  id: type + time,
  type,
  description: type,
  time,
  deviceId,
});
function timeline(
  events: Event[],
  date = day,
  fetched = "2026-11-24T17:00:00Z",
) {
  const snap = demoSnapshot();
  snap.eventsAt = fetched;
  snap.events = events;
  return dayTimeline(snap, date, at(fetched));
}
it("carries the prior arming state into midnight and stops at the fetched history", () => {
  const result = timeline([
    ev("disarmed", "2026-11-24T08:00:00Z"),
    ev("armed", "2026-11-23T10:00:00Z"),
  ]);
  expect(result.rows[0].segments).toEqual([
    {
      from: at("2026-11-23T23:00:00Z"),
      to: at("2026-11-24T08:00:00Z"),
      action: "armed",
    },
    {
      from: at("2026-11-24T08:00:00Z"),
      to: at("2026-11-24T17:00:00Z"),
      action: "disarmed",
    },
  ]);
  expect(result.rows[0].marks).toHaveLength(1);
});
it("keeps unidentified plugs as events and makes other plug states uncertain", () => {
  const rows = timeline([
    ev("output_deactivated", "2026-11-24T12:00:00Z"),
    ev("output_activated", "2026-11-24T07:00:00Z", "plug-1"),
  ]).rows;
  const plug = rows.find((row) => row.id === "plug:plug-1")!;
  expect(plug.segments.map((s) => s.action)).toEqual([
    undefined,
    "plug-on",
    undefined,
  ]);
  expect(rows.find((row) => row.id === "plug:unknown")?.segments).toEqual([]);
});
it("uses Madrid civil day lengths and preserves uncertainty for a repeated hour", () => {
  const spring = timeline([], "2026-03-29"),
    autumn = timeline(
      [
        {
          id: "local",
          type: "armed",
          description: "Armed",
          localTime: "2026-10-25T02:30:00",
        },
      ],
      "2026-10-25",
    );
  expect((spring.end - spring.start) / 3600000).toBe(23);
  expect((autumn.end - autumn.start) / 3600000).toBe(25);
  expect(autumn.uncertainTimes).toBe(1);
  expect(autumn.rows[0].marks).toHaveLength(0);
});

it("resolves identified and anonymous changes in source order at the same instant", () => {
  const time = "2026-11-24T09:00:00Z";
  const known = ev("output_activated", time, "plug-1");
  const unidentified = ev("output_deactivated", time);
  function finalState(events: Event[]) {
    return timeline(events)
      .rows.find((row) => row.id === "plug:plug-1")!
      .segments.at(-1)?.action;
  }
  expect(finalState([known, unidentified])).toBe("plug-on");
  expect(finalState([unidentified, known])).toBeUndefined();
});

it("keeps repeated arming marks on one uninterrupted state segment", () => {
  const row = timeline([
    ev("armed", "2026-11-24T14:00:00Z"),
    ev("armed", "2026-11-24T12:00:00Z"),
    ev("armed", "2026-11-23T18:00:00Z"),
  ]).rows[0];
  expect(row.marks).toHaveLength(2);
  expect(row.segments).toEqual([
    {
      from: at("2026-11-23T23:00:00Z"),
      to: at("2026-11-24T17:00:00Z"),
      action: "armed",
    },
  ]);
});

it("keeps qualified and unqualified annex changes on one evidenced area", () => {
  const snap = demoSnapshot();
  snap.areas = [
    snap.areas[0],
    { id: 7, name: "Garden", mode: "disarmed", partial: false },
  ];
  snap.events = [
    ev("disarmedannex", "2026-11-24T10:00:00Z"),
    { ...ev("armedannex", "2026-11-24T06:00:00Z"), areaId: 7 },
  ];
  const result = dayTimeline(snap, day, at("2026-11-24T16:00:00Z"));
  expect(result.rows.map((row) => row.id)).toEqual(["area:0", "area:7"]);
  expect(result.rows[1].marks.map((m) => m.action)).toEqual([
    "armed",
    "disarmed",
  ]);
  expect(result.rows[1].segments.map((s) => s.action)).toEqual([
    undefined,
    "armed",
    "disarmed",
  ]);
});

it("bounds a missing switch time with neighbouring records instead of continuing the old state", () => {
  const missing = { id: "no-time", type: "disarmed", description: "Disarmed" };
  const events = [
    ev("battery_low", "2026-11-24T14:00:00Z"),
    missing,
    ev("internet_restored", "2026-11-24T12:00:00Z"),
    ev("armed", "2026-11-23T18:00:00Z"),
  ];
  const result = timeline(events);
  expect(result.rows[0].segments).toEqual([
    { from: result.start, to: at("2026-11-24T12:00:00Z"), action: "armed" },
    {
      from: at("2026-11-24T12:00:00Z"),
      to: at("2026-11-24T14:00:00Z"),
      action: undefined,
    },
    { from: at("2026-11-24T14:00:00Z"), to: result.until, action: "disarmed" },
  ]);
  expect(result.rows[0].marks).toHaveLength(0);
  expect(result.unplaced).toEqual([missing]);
  expect(timeline(events, "2026-11-23").unplaced).toEqual([]);
});

it("does not restore an older state within two overlapping autumn clock changes", () => {
  const result = timeline(
    [
      {
        id: "B",
        localTime: "2026-10-25T02:40:00",
        type: "disarmed",
        description: "Disarmed",
      },
      {
        id: "A",
        localTime: "2026-10-25T02:20:00",
        type: "armed",
        description: "Armed",
      },
      ev("partialarmed", "2026-10-24T21:00:00Z"),
    ],
    "2026-10-25",
  );
  expect(result.rows[0].segments).toEqual([
    { from: result.start, to: at("2026-10-25T00:20:00Z"), action: "partial" },
    {
      from: at("2026-10-25T00:20:00Z"),
      to: at("2026-10-25T01:40:00Z"),
      action: undefined,
    },
    { from: at("2026-10-25T01:40:00Z"), to: result.end, action: "disarmed" },
  ]);
});
