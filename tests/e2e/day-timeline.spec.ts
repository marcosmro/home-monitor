import { expect, test } from "@playwright/test";
import { demoSnapshot } from "../../src/shared/demo";
import { defaults } from "../../src/shared/model";
import { logs } from "../../src/shared/normalize";

test("inspects keypad transitions and anonymous plug switches on a shared day axis", async ({
  page,
}) => {
  const snap = demoSnapshot();
  snap.demo = false;
  snap.eventsAt = "2026-11-19T22:00:00Z";
  snap.events = logs({
    Records: [
      ["armed", "2026-11-18T20:30:00Z", "Marcos", "App"],
      ["output_deactivated", "2026-11-18T18:05:00Z"],
      ["partialarmed", "2026-11-18T13:00:00Z", "Marcos", "Keytag"],
      ["output_activated", "2026-11-18T07:45:00Z"],
      ["disarmed", "2026-11-18T07:00:00Z", "Ana", "Keypad"],
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
  await page.goto("/");
  await page
    .getByRole("button", { name: "Actividad", exact: true })
    .first()
    .click();
  await page.getByLabel("Fecha de la cronología").fill("2026-11-18");
  const chart = page.getByRole("region", { name: "Cronología del día" });
  await expect(chart.locator(".day-chart-row")).toHaveCount(2);
  await expect(chart.locator(".seg-armed.day-segment")).toHaveCount(2);
  await chart.getByRole("button", { name: /08:00.*Ana.*Teclado/ }).click();
  await expect(chart.locator(".day-change")).toContainText("Teclado");
  await expect(chart.locator(".day-change")).toContainText("Ana");
  await chart.screenshot({ path: "/tmp/home-monitor-day-timeline.png" });
  await page.setViewportSize({ width: 390, height: 850 });
  await chart.getByRole("button", { name: /19:05.*Enchufe apagado/ }).click();
  await expect(chart.locator(".day-change")).toContainText("Enchufe apagado");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
});
