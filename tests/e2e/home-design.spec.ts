import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Start demo mode", exact: true })
    .click();
});

test("icon navigation explains itself on keyboard focus and Escape dismisses the tooltip", async ({
  page,
}) => {
  const map = page.getByRole("button", { name: "House map", exact: true });
  await map.focus();
  await expect(page.getByRole("tooltip")).toHaveText("House map");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await expect(map).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(map).toHaveAttribute("aria-current", "page");
});

test("compact sensor icons retain distinct activity and health descriptions", async ({
  page,
}) => {
  const row = page
    .locator(".sensor-row")
    .filter({ has: page.locator(".activity-state.open") })
    .first();
  await row.locator(".activity-state").hover();
  await expect(page.getByRole("tooltip")).toHaveText("Open");
  await row.locator(".health").hover();
  await expect(page.getByRole("tooltip")).toHaveText("OK");
  await expect(row).toHaveAccessibleName(/Open, OK/);
  await row.click();
  await expect(
    page.getByRole("complementary", { name: "Sensor details" }),
  ).toBeVisible();
});
