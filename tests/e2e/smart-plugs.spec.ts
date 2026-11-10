import { test, expect } from "@playwright/test";
import { demoSnapshot } from "../../src/shared/demo";
import { smartPlugs } from "../../src/shared/smart-plugs";
import { defaults } from "../../src/shared/model";

test("smart plugs appear in inventory and expose power and timer status", async ({
  page,
}) => {
  const snap = demoSnapshot();
  snap.demo = false;
  snap.devices.push(
    ...smartPlugs(
      [
        {
          Id: "9",
          Label: "Porch lamp",
          Status: "Off",
          TimerActive: true,
          Manufacturer: "Indoor SmartPlug",
        },
      ],
      new Date().toISOString(),
    ),
  );
  await page.addInitScript(
    ({ snap, prefs }) => {
      window.home = {
        snapshot: async () => snap,
        preferences: async () => prefs,
        subscribe: () => () => {},
        houseMap: async () => ({ plans: [], rooms: [], placements: {} }),
      } as unknown as typeof window.home;
    },
    { snap, prefs: { ...defaults, names: "original" } },
  );
  await page.goto("/");
  const plug = page.getByRole("button", {
    name: /Porch lamp · Smart plug · Off/,
  });
  await expect(plug).toBeVisible();
  await plug.click();
  await expect(
    page.getByRole("heading", { name: "Porch lamp", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".sensor-focus-stats")).toContainText("Off");
  await expect(page.locator(".detail-panel")).toContainText("TimerOn");
  await expect(page.locator(".detail-panel")).toContainText("Indoor SmartPlug");
});
