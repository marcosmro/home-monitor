import { expect, test } from "vitest";
import {
  activityDay,
  calendarDays,
  canSelectActivityDay,
} from "../src/shared/activity-calendar";
test("events use the Madrid date and preserve valid local wall dates", () => {
  expect(activityDay({ time: "2026-11-09T23:30:00Z" })).toBe("2026-11-10");
  expect(activityDay({ localTime: "2026-11-09T23:30:00" })).toBe("2026-11-09");
  expect(activityDay({ localTime: "2026-02-31T12:00:00" })).toBeUndefined();
  expect(activityDay({})).toBeUndefined();
});
test("Monday-first calendar includes leap days and six-week months", () => {
  expect(calendarDays("2024-02").filter(Boolean)).toHaveLength(29);
  expect(calendarDays("2026-11")).toHaveLength(42);
  expect(calendarDays("2026-11")[6]).toBe("2026-11-01");
  expect(calendarDays("2026-11")[35]).toBe("2026-11-30");
});

test("activity selection rejects future and invalid dates at Madrid's day boundary", () => {
  const beforeMidnight = Date.parse("2026-11-09T22:59:59Z");
  const afterMidnight = Date.parse("2026-11-09T23:00:00Z");
  expect(canSelectActivityDay("2026-11-09", beforeMidnight)).toBe(true);
  expect(canSelectActivityDay("2026-11-10", beforeMidnight)).toBe(false);
  expect(canSelectActivityDay("2026-11-10", afterMidnight)).toBe(true);
  expect(canSelectActivityDay("2026-11-11", afterMidnight)).toBe(false);
  expect(canSelectActivityDay("2026-02-31", afterMidnight)).toBe(false);
  expect(canSelectActivityDay("2026-2-01", afterMidnight)).toBe(false);
  expect(canSelectActivityDay("invalid", afterMidnight)).toBe(false);
  expect(canSelectActivityDay("2024-02-29", afterMidnight)).toBe(true);
});

test("future-date rules follow Madrid summer time and year rollover", () => {
  expect(
    canSelectActivityDay("2026-07-02", Date.parse("2026-07-01T21:59:59Z")),
  ).toBe(false);
  expect(
    canSelectActivityDay("2026-07-02", Date.parse("2026-07-01T22:00:00Z")),
  ).toBe(true);
  expect(
    canSelectActivityDay("2027-01-01", Date.parse("2026-12-31T22:59:59Z")),
  ).toBe(false);
  expect(
    canSelectActivityDay("2027-01-01", Date.parse("2026-12-31T23:00:00Z")),
  ).toBe(true);
});
