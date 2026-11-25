import { test, expect } from "@playwright/test";

test("activity displays actor tag colors and distinct armed/disarmed icons", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-11-09T20:00:00Z"));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Start demo mode", exact: true })
    .click();
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  const chart = page.locator(".day-timeline");
  await chart.getByRole("button", { name: /System fully armed/ }).click();
  await expect(chart.locator(".day-change")).toContainText("Via App");
  await chart.getByRole("button", { name: /System disarmed/ }).click();
  await expect(chart.locator(".colored-key.tag-yellow")).toBeVisible();
  await expect(chart.locator(".day-change")).toContainText("By Ana");
  await expect(page.locator(".timeline article")).toHaveCount(0);
  await page.screenshot({ path: "/tmp/home-activity-tags.png" });
  await page.setViewportSize({ width: 390, height: 850 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page
    .getByRole("button", { name: "House overview", exact: true })
    .click();
  await page.locator(".calendar-days .has-events").last().click();
  await expect(
    page.locator(".day-key-legend .key-tag-badge").first(),
  ).toBeVisible();
});

test("a mixed day shows arming and plug markers and names each switch in Spanish", async ({
  page,
}) => {
  const { demoSnapshot } = await import("../../src/shared/demo");
  const { defaults } = await import("../../src/shared/model");
  const { logs } = await import("../../src/shared/normalize");
  const snap = demoSnapshot();
  snap.demo = false;
  snap.events = logs({
    Records: ["armed", "output_activated", "output_deactivated"].map(
      (EventType) => ({ EventType, Time: snap.statusAt }),
    ),
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
  await page.goto("/");
  const day = page.locator(".calendar-days .has-events");
  await expect(day).toHaveAccessibleName(
    /Armado y desarmado \(1\), Enchufes \(2\)/,
  );
  await expect(day.locator(".day-kind")).toHaveCount(2);
  await day.click();
  await page.locator(".marker-plug").click();
  const group = page.getByRole("list", { name: "2 eventos" });
  await expect(group.getByRole("listitem")).toHaveCount(2);
  await expect(group).toContainText("Enchufe apagado");
  await expect(group).toContainText("Enchufe encendido");
  await page.locator(".marker-alarm").click();
  await expect(group).toHaveCount(0);
  await expect(page.locator(".day-change")).toHaveCount(1);
});
