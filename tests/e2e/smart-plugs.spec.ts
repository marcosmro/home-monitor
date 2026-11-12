import { test, expect } from "@playwright/test";
import { demoSnapshot } from "../../src/shared/demo";
import { smartPlugs } from "../../src/shared/smart-plugs";
import { defaults } from "../../src/shared/model";
import { demoMap } from "../../src/shared/demo-map";

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

async function livePlugHome(page: import("@playwright/test").Page) {
  const snap = demoSnapshot();
  snap.demo = false;
  snap.devices.push(
    ...smartPlugs(
      [{ Id: "9", Label: "Porch lamp", Status: "On" }],
      new Date().toISOString(),
    ),
  );
  await page.addInitScript(
    ({ snap, prefs, map }) => {
      let saved = prefs;
      const placements: Record<string, unknown> = {};
      window.home = {
        snapshot: async () => snap,
        preferences: async () => saved,
        savePreferences: async (p: typeof prefs) => {
          saved = p;
        },
        subscribe: () => () => {},
        houseMap: async () => ({ ...map, placements }),
        mapImage: async () => "",
        saveMapPlacement: async (id: string, p: unknown) => {
          placements[id] = p;
        },
      } as unknown as typeof window.home;
    },
    {
      snap,
      prefs: { ...defaults, names: "original" as const },
      map: demoMap(),
    },
  );
  await page.goto("/");
  return snap;
}
const roomRow = (page: import("@playwright/test").Page, room: string) =>
  page.locator(".sensor-matrix tr").filter({
    has: page.locator(".matrix-room", { hasText: new RegExp(`^${room}$`) }),
  });

test("connected smart plugs show as healthy and can be assigned to a room", async ({
  page,
}) => {
  const snap = await livePlugHome(page);
  const plug = page.getByRole("button", { name: /Porch lamp · Smart plug/ });
  await expect(plug).toHaveClass(/healthy/);
  await expect(roomRow(page, "Unassigned")).toHaveCount(1);
  await plug.click();
  await expect(page.locator(".map-sensor-unassigned")).toBeVisible();
  await page.getByRole("button", { name: "View details", exact: true }).click();
  const target = snap.devices[0];
  await page
    .getByLabel("Room", { exact: true })
    .selectOption({ label: target.room });
  await expect(roomRow(page, "Unassigned")).toHaveCount(0);
  await expect(
    roomRow(page, target.room).getByRole("button", { name: /Porch lamp/ }),
  ).toBeVisible();
});

test("placing an unassigned smart plug on the plan assigns its room", async ({
  page,
}) => {
  const snap = await livePlugHome(page);
  await page.getByRole("button", { name: /Porch lamp · Smart plug/ }).click();
  await page
    .getByRole("button", { name: "Edit sensor locations", exact: true })
    .click();
  await expect(page.locator(".location-editor")).toContainText(
    "is not on the map yet",
  );
  // The first demo room is centred at 27% / 27% of the first plan.
  const plan = await page.locator(".location-plan").boundingBox();
  await page.mouse.click(
    plan!.x + plan!.width * 0.27,
    plan!.y + plan!.height * 0.32,
  );
  await expect(page.locator(".location-pin.confirmed")).toHaveCount(1);
  const room = snap.devices.find((d) => d.floorId === "f0")!.room;
  await expect(
    roomRow(page, room).getByRole("button", { name: /Porch lamp/ }),
  ).toBeVisible();
  await expect(roomRow(page, "Unassigned")).toHaveCount(0);
});
