import { test, expect } from "@playwright/test";

test("activity displays actor tag colors and distinct armed/disarmed icons", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Start demo mode", exact: true })
    .click();
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  const armed = page
    .locator(".timeline article")
    .filter({ hasText: "System fully armed" });
  const disarmed = page
    .locator(".timeline article")
    .filter({ hasText: "System disarmed" });
  await expect(armed.locator(".action-armed")).toHaveCount(1);
  await expect(
    armed.getByRole("img", { name: "Assigned key tag: Blue" }),
  ).toBeVisible();
  await expect(armed).toContainText("By Marcos");
  await expect(armed).toContainText("Via App");
  await expect(disarmed.locator(".action-disarmed")).toHaveCount(1);
  await expect(
    disarmed.getByRole("img", { name: "Assigned key tag: Yellow" }),
  ).toBeVisible();
  await expect(disarmed).toContainText("By Ana");
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
    page.locator(".calendar-event-list .key-tag-badge").first(),
  ).toBeVisible();
});
