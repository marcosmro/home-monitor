import { expect, test } from "@playwright/test";
import { demoSnapshot } from "../../src/shared/demo";
import { defaults } from "../../src/shared/model";
import { logs } from "../../src/shared/normalize";

test("day selection, alarm durations and plug filtering share the same history", async ({
  page,
}) => {
  const snap = demoSnapshot();
  snap.demo = false;
  snap.eventsAt = "2026-11-20T00:00:00Z";
  snap.events = logs({
    Records: [
      ["armed", "2026-11-18T20:30:00Z", "Marcos", "Keytag"],
      ["output_deactivated", "2026-11-18T18:05:00Z"],
      ["partialarmed", "2026-11-18T13:00:00Z", "Marcos", "App"],
      ["low-battery", "2026-11-18T12:05:00Z"],
      ["output_activated", "2026-11-18T07:45:00Z"],
      ["disarmed", "2026-11-18T07:00:00Z", "Ana", "Keytag"],
      ["armed", "2026-11-17T20:00:00Z", "Marcos", "Keypad"],
    ].map(([EventType, Time, User, Channel]) => ({
      EventType,
      Time,
      User,
      Channel,
    })),
  });
  await page.addInitScript(
    ({ snap, prefs }) => {
      window.home = {
        snapshot: async () => snap,
        preferences: async () => prefs,
        subscribe: () => () => {},
        houseMap: async () => ({ plans: [], rooms: [], placements: {} }),
      } as unknown as typeof window.home;
    },
    { snap, prefs: { ...defaults, language: "es" } },
  );
  await page.clock.setFixedTime(new Date("2026-11-24T12:00:00Z"));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Actividad", exact: true })
    .first()
    .click();
  const days = page.locator(".activity-page .calendar-days");
  await days.getByRole("button", { name: /18 de noviembre de 2026/ }).click();
  const chart = page.getByRole("region", { name: "Cronología del día" });
  const duration = chart
    .locator(".alarm-durations > div")
    .filter({ hasText: "Armado total" });
  await expect(duration).toContainText("10 h 30 min");
  await expect(chart.locator(".colored-key.tag-yellow")).toHaveCount(1);
  await expect(chart.locator(".colored-key.tag-blue")).toHaveCount(1);
  await chart.locator(".colored-key.tag-yellow").click();
  await chart.screenshot({ path: "/tmp/home-monitor-activity-reviewed.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await chart.locator(".colored-key.tag-blue").scrollIntoViewIfNeeded();
  await expect(chart.locator(".colored-key.tag-blue")).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await chart.screenshot({ path: "/tmp/home-monitor-activity-mobile.png" });
  await page
    .getByRole("combobox", { name: "Filtrar actividad" })
    .selectOption("plug");
  await expect(chart.locator(".day-chart-row")).toHaveCount(1);
  await expect(
    days.getByRole("button", { name: /18 de noviembre de 2026/ }),
  ).toHaveAccessibleName(/2 eventos.*Enchufes/);
  await expect(
    days.getByRole("button", { name: /17 de noviembre de 2026/ }),
  ).toHaveAccessibleName(/0 eventos/);
});
