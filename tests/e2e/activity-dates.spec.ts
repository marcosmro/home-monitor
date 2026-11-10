import { test, expect } from "@playwright/test";
import { demoSnapshot } from "../../src/shared/demo";
import { defaults } from "../../src/shared/model";

test("future days cannot be clicked or focused, and month navigation stops at this month", async ({
  page,
}) => {
  // Still November 9 in Los Angeles, already November 10 at the house.
  await page.clock.setFixedTime(new Date("2026-11-09T23:30:00Z"));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Start demo mode", exact: true })
    .click();
  const today = page.locator(".calendar-days .is-today");
  const future = page.getByRole("button", {
    name: "11 November 2026 · Future date",
    exact: true,
  });
  await expect(today).toContainText("10");
  await expect(future).toBeDisabled();
  await expect(page.locator(".calendar-days button:disabled")).toHaveCount(20);
  await expect(
    page.getByRole("button", { name: "Next month", exact: true }),
  ).toBeDisabled();
  await future.scrollIntoViewIfNeeded();
  const box = (await future.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(today).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("tab", { name: "Sensor", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await future.evaluate((el) => (el as HTMLButtonElement).focus());
  await expect(future).not.toBeFocused();
  await today.focus();
  await page.keyboard.press("Tab");
  await expect(page.locator(".calendar-days button:focus")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Previous month", exact: true })
    .click();
  await expect(page.locator(".calendar-days button:disabled")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Next month", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Next month", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Next month", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(today).toHaveAttribute("aria-pressed", "true");
  await page
    .locator(".activity-strip")
    .screenshot({ path: "/tmp/home-calendar-date-guard.png" });
});

test("Madrid midnight unlocks the new day and month without reloading", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-12-31T22:59:50Z") });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Start demo mode", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Next month", exact: true }),
  ).toBeDisabled();
  await page.clock.fastForward(20000);
  await page.clock.resume();
  await expect(
    page.getByRole("button", { name: "Next month", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(page.locator(".calendar-month strong")).toHaveText(
    "January 2027",
  );
  await expect(page.locator(".calendar-days .is-today")).toContainText("1");
  await expect(
    page.getByRole("button", {
      name: "2 January 2027 · Future date",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Next month", exact: true }),
  ).toBeDisabled();
});

test("sensor activity filtering excludes future events from the selected day", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-11-09T23:30:00Z"));
  const snapshot = {
    ...demoSnapshot(),
    demo: false,
    events: [
      {
        id: "past",
        deviceId: "demo-0",
        type: "test",
        time: "2026-11-09T12:00:00Z",
        description: "Earlier event",
      },
      {
        id: "future",
        deviceId: "demo-0",
        type: "test",
        time: "2099-01-01T12:00:00Z",
        description: "Future event",
      },
    ],
  };
  await page.addInitScript(
    ({ snapshot, preferences }) => {
      window.home = {
        snapshot: async () => snapshot,
        preferences: async () => preferences,
        subscribe: () => () => {},
        houseMap: async () => ({ plans: [], rooms: [], placements: {} }),
      } as unknown as typeof window.home;
    },
    { snapshot, preferences: defaults },
  );
  await page.goto("/");
  await page.locator(".matrix-sensor").first().click();
  await page.getByRole("tab", { name: "Activity", exact: true }).click();
  await page
    .getByRole("button", { name: "Selected sensor", exact: true })
    .click();
  await page
    .locator(".calendar-days .has-events:not(:disabled)")
    .first()
    .click();
  await expect(page.locator(".activity-day-heading h2")).toHaveText(
    "9 November 2026",
  );
  await expect(page.locator(".calendar-event-list")).toContainText(
    "Earlier event",
  );
  await expect(page.locator(".calendar-event-list")).not.toContainText(
    "Future event",
  );
});
