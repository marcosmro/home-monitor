import { expect, test } from "vitest";
import {
  actorTag,
  activityCategory,
  matchesActivityFilter,
  keyTagPeople,
  activityAction,
} from "../src/shared/activity-identity";
import { logs } from "../src/shared/normalize";

test("matches known tag colors without guessing ambiguous actors", () => {
  const people = keyTagPeople([
    { FirstName: "Ana", LastName: "One", Tag: { Color: "YELLOW" } },
    { firstName: "Ana", lastName: "Two", tag: null },
    { firstName: "Tom", lastName: "Smith", tag: { color: "green" } },
    { FirstName: "Unknown", Tag: { Color: "purple" } },
  ]);
  expect(actorTag("Ana", people)).toBeUndefined();
  expect(actorTag(" ana one ", people)?.color).toBe("yellow");
  expect(actorTag("Tom", people)?.color).toBe("green");
  expect(actorTag("Unknown", people)?.color).toBeUndefined();
  expect(actorTag("Unreported", people)).toBeUndefined();
});

test("keeps access channel separate from action and assigned tag", () => {
  const events = logs({
    Records: [
      {
        EventType: "disarmed",
        User: "Tom",
        Channel: "App",
        Time: "2026-11-09T12:00:00Z",
      },
      { EventType: "partial-armed" },
      { EventType: "armed" },
      { EventType: "alarm" },
    ],
  });
  expect(events[0].channel).toBe("App");
  expect(events.map(activityAction)).toEqual([
    "disarmed",
    "partial",
    "armed",
    "other",
  ]);
});

test("the calendar and timeline filters classify the same events", () => {
  const events = logs({
    Records: [
      "armed",
      "alarm_burglary_confirmed",
      "output_deactivated",
      "battery_low",
      "custom",
    ].map((EventType) => ({ EventType })),
  });
  expect(events.map(activityCategory)).toEqual([
    "arming",
    "incidents",
    "plug",
    "health",
    "other",
  ]);
  expect(
    events.filter((e) => matchesActivityFilter(e, "alarm")).map((e) => e.type),
  ).toEqual(["armed", "alarm_burglary_confirmed"]);
  expect(
    events.filter((e) => matchesActivityFilter(e, "plug")).map((e) => e.type),
  ).toEqual(["output_deactivated"]);
});
