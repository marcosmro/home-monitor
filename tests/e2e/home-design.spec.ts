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
  await expect(
    page.getByRole("button", { name: "House map", exact: true }),
  ).toHaveCount(0);
  const map = page.getByRole("button", { name: "Cameras", exact: true });
  await map.focus();
  await expect(page.getByRole("tooltip")).toHaveText("Cameras");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await expect(map).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(map).toHaveAttribute("aria-current", "page");
});

test("compact sensor icons retain distinct activity and health descriptions", async ({
  page,
}) => {
  const row = page.locator('.matrix-sensor[aria-label*="Open"]').first();
  await row.hover();
  await expect(page.getByRole("tooltip")).toContainText("Open");
  await expect(page.getByRole("tooltip")).toContainText("Health: OK");
  await expect(row).toHaveAccessibleName(/Open.*Health: OK/);
  await row.click();
  await page.getByRole("button", { name: "View details", exact: true }).click();
  await expect(
    page.getByRole("complementary", { name: "Sensor details" }),
  ).toBeVisible();
});

test("selected sensor title stays beside its icon without squeezing the details", async ({
  page,
}) => {
  await page.locator(".matrix-sensor").first().click();
  await page.getByRole("button", { name: "View details", exact: true }).click();
  const panel = page.getByRole("complementary", { name: "Sensor details" });
  const title = await panel.locator(".sensor-detail-title").boundingBox();
  const icon = await panel.locator(".detail-icon").boundingBox();
  expect(title).not.toBeNull();
  expect(icon).not.toBeNull();
  expect(title!.x).toBeGreaterThanOrEqual(icon!.x + icon!.width);
  expect(title!.width).toBeGreaterThan(200);
  expect(title!.height).toBeLessThan(80);
  await expect(panel.locator(".sensor-focus-stats")).toBeInViewport();
});

test("floor-plan edit control edits in place and keeps the plan", async ({
  page,
}) => {
  // With nothing selected the panel shows every floor; open the first one.
  await page.locator(".house-plan-card").first().click();
  await page.locator(".location-pin").first().click();
  const planId = await page
    .locator(".location-plan")
    .getAttribute("data-plan-id");
  const edit = page.getByRole("button", {
    name: "Edit sensor locations",
    exact: true,
  });
  await edit.click();
  await expect(edit).toHaveAttribute("aria-pressed", "true");
  const editor = page.getByRole("region", { name: "Edit sensor locations" });
  await expect(editor).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "Sensor", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page
    .getByRole("button", { name: "Finish editing", exact: true })
    .click();
  await expect(editor).toHaveCount(0);
  await expect(edit).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".location-plan")).toHaveAttribute(
    "data-plan-id",
    planId!,
  );
});

test("temperature layer colors rooms and can be switched off", async ({
  page,
}) => {
  // With nothing selected the panel shows every floor; open the first one.
  await page.locator(".house-plan-card").first().click();
  const toggle = page.getByRole("button", {
    name: "Temperature layer",
    exact: true,
  });
  const before = await page.locator(".location-plan").boundingBox();
  await toggle.click();
  const after = await page.locator(".location-plan").boundingBox();
  expect(Math.abs(after!.height - before!.height)).toBeLessThan(2);
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".temperature-plan")).toBeVisible();
  await expect(page.locator(".plan-temperature-label")).toHaveCount(4);
  await expect(page.locator(".temperature-map-legend")).toContainText("16°C");
  await expect(page.locator(".temperature-map-legend")).toContainText("28°C");
  await page.locator(".matrix-floor-link").last().click();
  await expect(page.locator(".plan-temperature-label")).toHaveCount(3);
  await toggle.click();
  await expect(page.locator(".temperature-plan")).toHaveCount(0);
  await expect(page.locator(".temperature-map-legend")).toHaveCount(0);
});
