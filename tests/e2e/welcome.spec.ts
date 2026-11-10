import { test, expect } from "@playwright/test";
import { demoSnapshot } from "../../src/shared/demo";
import { defaults } from "../../src/shared/model";

test("startup requires an explicit demo choice and login cancellation stays on welcome", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Welcome to Home Monitor" }),
  ).toBeVisible();
  await expect(page.locator(".matrix-sensor")).toHaveCount(0);
  await page.getByRole("button", { name: "Log in to my account" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Browser preview is demo only",
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.locator(".matrix-sensor")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Start demo mode", exact: true })
    .click();
  await expect(page.locator(".matrix-sensor")).toHaveCount(48);
  await expect(page.locator(".mode-badge")).toHaveText("DEMO HOME");
});

for (const count of [1, 2]) {
  test(`account login opens live mode with ${count} properties and logout returns to welcome`, async ({
    page,
  }) => {
    await page.addInitScript(
      ({ snapshot, preferences, count }) => {
        const panels = Array.from({ length: count }, (_, i) => ({
          id: `home-${i}`,
          name: `My home ${i}`,
        }));
        window.home = {
          houseMap: async () => ({ plans: [], rooms: [], placements: {} }),
          snapshot: async () => snapshot,
          preferences: async () => preferences,
          subscribe: () => () => {},
          login: async (_email: string, password: string) => {
            if (password === "wrong") throw new Error("Invalid credentials");
            return panels;
          },
          savedLogin: async () => panels,
          savePreferences: async () => {},
          select: async (id: string) => {
            await new Promise((resolve) => setTimeout(resolve, 500));
            return {
              ...snapshot,
              demo: false,
              panelId: id,
              name: panels.find((p) => p.id === id)!.name,
              devices: [],
              readOnly: true,
            };
          },
          logout: async () => snapshot,
        } as unknown as typeof window.home;
      },
      { snapshot: demoSnapshot(), preferences: defaults, count },
    );
    await page.goto("/");
    await page.getByRole("button", { name: "Log in to my account" }).click();
    await page.getByLabel("Email", { exact: true }).fill("test@example.com");
    await page.getByLabel("Password", { exact: true }).fill("wrong");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("Invalid credentials");
    await expect(page.locator(".matrix-sensor")).toHaveCount(0);
    await page.getByLabel("Password", { exact: true }).fill("correct");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Opening your home…" }),
    ).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator(".mode-badge")).toHaveText("LIVE ACCOUNT");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page
      .getByLabel("House display name", { exact: true })
      .fill("Tabolado 17");
    await expect(page.locator(".app")).toContainText("Tabolado 17");
    if (count > 1) {
      await page
        .getByLabel("Connected house", { exact: true })
        .selectOption("home-1");
      await expect(
        page.getByLabel("Connected house", { exact: true }),
      ).toHaveValue("home-1");
      await expect(
        page.getByLabel("House display name", { exact: true }),
      ).toHaveValue("");
      await page
        .getByLabel("Connected house", { exact: true })
        .selectOption("home-0");
      await expect(
        page.getByLabel("House display name", { exact: true }),
      ).toHaveValue("Tabolado 17");
    }

    await page
      .getByRole("button", { name: "Disconnect & forget saved account" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Welcome to Home Monitor" }),
    ).toBeVisible();
    await expect(page.locator(".mode-badge")).toHaveCount(0);
  });
}

test("saved account identifies the email and lets users switch accounts", async ({
  page,
}) => {
  await page.addInitScript(
    ({ snapshot, preferences }) => {
      window.home = {
        houseMap: async () => ({ plans: [], rooms: [], placements: {} }),
        snapshot: async () => snapshot,
        preferences: async () => preferences,
        subscribe: () => () => {},
        savedAccount: async () => ({ email: "alex@example.com" }),
        savedLogin: async () => {
          throw new Error("Please sign in again");
        },
      } as unknown as typeof window.home;
    },
    { snapshot: demoSnapshot(), preferences: defaults },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Log in to my account" }).click();
  await expect(page.locator(".saved-account-email")).toHaveText(
    "alex@example.com",
  );
  await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);
  await page
    .getByRole("button", { name: "Continue as alex@example.com" })
    .click();
  await expect(page.getByRole("alert")).toContainText("Please sign in again");
  await page.getByRole("button", { name: "Use another account" }).click();
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "Back to saved account" }).click();
  await expect(
    page.getByRole("button", { name: "Continue as alex@example.com" }),
  ).toBeVisible();
});

test("alarm controls explain their effect and can be enabled and disabled", async ({
  page,
}) => {
  await page.addInitScript(
    ({ snapshot, preferences }) => {
      let current = { ...snapshot, demo: false, readOnly: true };
      window.home = {
        houseMap: async () => ({ plans: [], rooms: [], placements: {} }),
        snapshot: async () => current,
        preferences: async () => preferences,
        subscribe: () => () => {},
        readOnly: async (value: boolean) => {
          current = { ...current, readOnly: value };
          return current;
        },
      } as unknown as typeof window.home;
    },
    { snapshot: demoSnapshot(), preferences: defaults },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const card = page.locator(".alarm-controls-card");
  await expect(card.getByRole("status")).toHaveText("Disabled · Read-only");
  await page.getByRole("button", { name: "About alarm controls" }).focus();
  await expect(page.getByRole("tooltip")).toContainText(
    "It does not change the alarm state",
  );
  await expect(page.getByRole("tooltip")).toContainText(
    "it does not disarm your alarm",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Enable alarm controls", exact: true })
    .click();
  await expect(card.getByRole("status")).toHaveText(
    "Enabled · Panel code required",
  );
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Disable alarm controls", exact: true })
    .click();
  await expect(card.getByRole("status")).toHaveText("Disabled · Read-only");
});
