import { test, expect } from "@playwright/test";
import { demoSnapshot } from "../../src/shared/demo";
import { demoMap } from "../../src/shared/demo-map";
import { defaults } from "../../src/shared/model";

test("camera selection connects map, details, saved photos, controls and full map", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Start demo mode", exact: true })
    .click();
  await page.getByRole("button", { name: "Cameras", exact: true }).click();
  const camera = page.locator(".camera-card").first();
  await camera.getByRole("button", { name: "Take photo", exact: true }).click();
  await expect(camera.locator(".camera-preview")).toBeVisible();
  await expect(
    camera.getByRole("button", { name: "Take photo", exact: true }),
  ).toBeEnabled();
  await camera.getByRole("button", { name: "Take photo", exact: true }).click();
  await expect(page.locator(".photo-grid .photo-image")).toHaveCount(2);
  await camera
    .getByRole("button", { name: "Show on floor plan", exact: true })
    .click();
  await expect(
    page.getByRole("tab", { name: "Sensor", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".location-pin.is-selected")).toHaveAttribute(
    "aria-label",
    "Locate Detector con cámara",
  );
  await expect(page.locator(".detail-panel")).toContainText("Entrada");
  await page.getByRole("tab", { name: "Details", exact: true }).click();
  await expect(page.locator(".detail-panel h2")).toHaveText(
    "Detector con cámara",
  );
  await expect(page.locator(".camera-latest-preview img")).toBeVisible();
  await page
    .getByRole("button", { name: "Open latest camera photo", exact: true })
    .click();
  await expect(
    page.getByRole("tab", { name: "Photos", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.locator(".camera-photo-history button:visible"),
  ).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Newer photo", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Older photo", exact: true }).click();
  await expect(page.locator(".camera-photo-navigation")).toContainText("2 / 2");
  await page.getByRole("tab", { name: "Sensor", exact: true }).click();
  await page.getByRole("tab", { name: "Photos", exact: true }).click();
  await expect(page.locator(".camera-photo-navigation")).toContainText("2 / 2");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "/tmp/home-camera-photos.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Camera controls", exact: true })
    .click();
  await expect(
    page.getByLabel("Filter photo history by camera", { exact: true }),
  ).toHaveValue("demo-3");
  await expect(page.locator(".camera-card.is-selected")).toContainText(
    "Entrada",
  );
  await page
    .locator(".camera-card.is-selected")
    .getByRole("button", { name: "Show on floor plan", exact: true })
    .click();
  await page.getByRole("button", { name: "House map", exact: true }).click();
  await expect(page.locator(".map-pin.selected")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Open sensor workspace", exact: true })
    .click();
  await expect(
    page.getByRole("tab", { name: "Details", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Activity", exact: true }).click();
  await page
    .getByRole("button", { name: "Selected sensor", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Selected sensor", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.locator(".matrix-sensor").first().click();
  await expect(
    page.getByRole("tab", { name: "Photos", exact: true }),
  ).toHaveCount(0);
});

test("late photo responses cannot overwrite another camera's context", async ({
  page,
}) => {
  const snap = { ...demoSnapshot(), demo: false };
  await page.addInitScript(
    ({ snap, prefs, map }) => {
      const photo = (cameraId: string) => ({
        id: cameraId,
        cameraId,
        cameraName: cameraId,
        room: cameraId,
        receivedAt: new Date().toISOString(),
        bytes: 100,
        demo: true,
      });
      (window as any).requestedCamera = "";
      window.home = {
        snapshot: async () => snap,
        preferences: async () => prefs,
        subscribe: () => () => {},
        houseMap: async () => ({ ...map, placements: {} }),
        photoLibrary: async (_offset: number, id: string) => {
          (window as any).requestedCamera = id;
          if (id === "demo-3")
            return new Promise((resolve) => {
              (window as any).releasePhotos = () =>
                resolve({ photos: [photo(id)], total: 1 });
            });
          return { photos: [], total: 0 };
        },
      } as unknown as typeof window.home;
    },
    { snap, prefs: defaults, map: demoMap() },
  );
  await page.goto("/");
  await page.locator(".matrix-sensor").nth(3).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).requestedCamera))
    .toBe("demo-3");
  await page
    .locator('.matrix-sensor[aria-label^="Detector con cámara"]')
    .nth(1)
    .click();
  await expect
    .poll(() => page.evaluate(() => (window as any).requestedCamera))
    .toBe("demo-7");
  await page.evaluate(() => (window as any).releasePhotos());
  await page.getByRole("tab", { name: "Photos", exact: true }).click();
  await expect(
    page.getByRole("tabpanel", { name: "Photos", exact: true }),
  ).toContainText("No saved photos for this camera.");
  await expect(page.locator(".camera-photo-history button")).toHaveCount(0);
  await expect(page.locator(".detail-panel")).toContainText("Salón");
});
