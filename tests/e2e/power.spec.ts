import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Start demo mode", exact: true })
    .click();
  await expect(page.locator(".matrix-sensor")).toHaveCount(48);
  await expect(page.locator(".power-notice")).toHaveCount(0);
});
test("an ongoing outage shows a persistent alert", async ({ page }) => {
  await page.getByRole("button", { name: "Settings" }).first().click();
  await page.getByRole("button", { name: "Power outage", exact: true }).click();
  const notice = page.locator(".power-notice");
  await expect(notice).toHaveAttribute("role", "alert");
  await expect(notice).toContainText("Power is out");
  await expect(notice.getByRole("button")).toHaveCount(0);
});
test("a finished outage shows its duration until dismissed", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Settings" }).first().click();
  await page
    .getByRole("button", { name: "Power restored", exact: true })
    .click();
  const notice = page.locator(".power-notice");
  await expect(notice).toContainText("Power was out");
  await expect(notice).toContainText("Out for 1 h 27 min.");
  await notice.getByRole("button", { name: "Dismiss power notice" }).click();
  await expect(notice).toHaveCount(0);
});
test("an inferred cut is labelled as possible and listed in settings", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Settings" }).first().click();
  await expect(page.locator(".outage-history")).toContainText(
    "None recorded so far.",
  );
  await page
    .getByRole("button", { name: "Possible power cut", exact: true })
    .click();
  const notice = page.locator(".power-notice.inferred");
  await expect(notice).toHaveAttribute("role", "alert");
  await expect(notice).toContainText("Possible power cut");
  await expect(notice).toContainText("all smart plugs unreachable");
  await expect(notice).toContainText("has not reported a mains failure");
  await expect(page.locator(".outage-list li")).toHaveCount(2);
  await expect(page.locator(".outage-list li").first()).toContainText(
    "ongoing",
  );
  await page
    .getByRole("button", { name: "Possible power cut ended", exact: true })
    .click();
  await expect(notice).toContainText("About 45 min");
  await notice
    .getByRole("button", { name: "Dismiss possible power cut" })
    .click();
  await expect(notice).toHaveCount(0);
  await expect(page.locator(".outage-list li")).toHaveCount(2);
});
