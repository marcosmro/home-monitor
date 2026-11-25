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
