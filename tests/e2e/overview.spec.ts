import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".sensor-row")).toHaveCount(48);
});
test("all 48 devices fit at 1440 × 900 in both themes", async ({ page }) => {
  for (const theme of ["light", "dark"]) {
    if (theme === "dark")
      await page
        .getByRole("button", { name: "Toggle light and dark theme" })
        .click();
    expect(
      await page
        .locator(".sensor-row")
        .evaluateAll((rows) =>
          rows.every((r) => r.getBoundingClientRect().bottom <= innerHeight),
        ),
    ).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  }
});
test("filters state how many devices are hidden", async ({ page }) => {
  await page.getByRole("button", { name: "Open 3", exact: true }).click();
  await expect(page.locator(".sensor-row")).toHaveCount(3);
  await expect(page.locator(".coverage")).toContainText("45 hidden");
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.locator(".sensor-row")).toHaveCount(48);
});
test("local Spanish alias persists and appears in search with original preserved", async ({
  page,
}) => {
  await page.locator(".sensor-row").first().click();
  await page
    .getByRole("textbox", { name: "Nombre en español" })
    .fill("Puerta de José — entrada principal");
  await page.reload();
  await page
    .getByRole("textbox", { name: "Find a sensor or room" })
    .fill("José");
  await expect(page.locator(".sensor-row")).toHaveCount(1);
  await page.locator(".sensor-row").click();
  await expect(
    page.getByRole("complementary", { name: "Sensor details" }),
  ).toContainText("Front door");
});
test("command has explicit confirmation and visible pending lifecycle", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Disarm", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("demo only");
  await page
    .getByRole("button", { name: "Confirm disarm", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Sending");
  await expect(
    page.getByRole("button", { name: "Disarm", exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole("status")).toContainText("Awaiting confirmation");
  await expect(page.getByRole("status")).toContainText(
    "Confirmed by the system",
  );
  await expect(page.locator(".alarm-title")).toContainText("Disarmed");
});
test("unknown outcomes block actions until read-only reconciliation", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("button", { name: "Unknown command outcome", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Disarm", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Reconcile state", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "No command was repeated",
  );
  await expect(
    page.getByRole("button", { name: "Disarm", exact: true }),
  ).toBeEnabled();
});
test("stale data preserves all devices and disables alarm controls", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("button", { name: "Stale connection", exact: true })
    .click();
  await page
    .getByRole("button", { name: "House overview", exact: true })
    .click();
  await expect(page.locator(".sensor-row")).toHaveCount(48);
  await expect(page.locator(".alarm-title")).toContainText("Last known");
  await expect(
    page.getByRole("button", { name: "Disarm", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".sensor-row").first()).toContainText("Stale");
});
test("smaller windows and comfortable density retain all devices without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.getByRole("button", { name: "Density: compact" }).click();
  await expect(page.locator(".sensor-row")).toHaveCount(48);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByText(
      "Scroll to review every sensor; none are paginated or collapsed.",
      { exact: false },
    ),
  ).toBeVisible();
});
test("keyboard search and dialog escape work", async ({ page }) => {
  await page.keyboard.press("Meta+k");
  await expect(
    page.getByRole("textbox", { name: "Find a sensor or room" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Disarm", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("temperature averages use the full inventory through filtering", async ({
  page,
}) => {
  const average = await page.locator(".house-temperature").innerText();
  await expect(page.locator(".room-temperature")).toHaveCount(12);
  await expect(page.locator(".house-temperature")).toContainText("20.9°");
  await page.getByRole("button", { name: "Open 3", exact: true }).click();
  await expect(page.locator(".house-temperature")).toHaveText(average, { useInnerText: true });
  await expect(page.locator(".room-temperature").first()).toContainText(
    "20.0°",
  );
});
