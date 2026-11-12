import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Start demo mode", exact: true })
    .click();
  await expect(page.locator(".matrix-sensor")).toHaveCount(48);
});
test("matrix retains all 48 devices and visible activity navigation in both themes", async ({
  page,
}) => {
  for (const theme of ["light", "dark"]) {
    if (theme === "dark")
      await page
        .getByRole("button", { name: "Toggle light and dark theme" })
        .click();
    await expect(page.locator(".matrix-sensor")).toHaveCount(48);
    await expect(page.locator(".activity-strip")).toBeInViewport({ ratio: 1 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  }
});
test("table count reflects filtered sensors and total", async ({ page }) => {
  await page.getByRole("button", { name: "Open 3", exact: true }).click();
  await expect(page.locator(".matrix-sensor")).toHaveCount(3);
  await expect(page.locator(".matrix-total")).toHaveText("3 of 48 sensors");
  await page
    .getByRole("button", { name: "All sensors 48", exact: true })
    .click();
  await expect(page.locator(".matrix-sensor")).toHaveCount(48);
});
test("local Spanish alias persists in the matrix with original preserved", async ({
  page,
}) => {
  await page.locator(".matrix-sensor").first().click();
  await page.getByRole("button", { name: "View details", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Nombre en español" })
    .fill("Puerta de José — entrada principal");
  await page.reload();
  await page
    .getByRole("button", { name: "Start demo mode", exact: true })
    .click();
  const renamed = page.locator(".matrix-panel").getByRole("button", {
    name: /Puerta de José — entrada principal/,
  });
  await expect(renamed).toHaveCount(1);
  await renamed.click();
  await page.getByRole("button", { name: "View details", exact: true }).click();
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
  await expect(page.locator(".matrix-sensor")).toHaveCount(48);
  await expect(page.locator(".alarm-title")).toContainText("Last known");
  await expect(
    page.getByRole("button", { name: "Disarm", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".matrix-sensor").first()).toHaveAccessibleName(
    /Stale/,
  );
});
test("smaller windows and comfortable density retain all devices without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByLabel("Sensor density", { exact: true })
    .selectOption("comfortable");
  await page
    .getByRole("button", { name: "House overview", exact: true })
    .click();
  await expect(page.locator(".matrix-sensor")).toHaveCount(48);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.locator(".matrix-sensor").last().scrollIntoViewIfNeeded();
  await expect(page.locator(".matrix-sensor").last()).toBeInViewport();
});
test("dialog Escape works without a search shortcut", async ({ page }) => {
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Disarm", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("temperature averages use the full inventory through filtering", async ({
  page,
}) => {
  const average = await page.locator(".house-temperature").innerText();
  await expect(page.locator(".house-temperature")).toContainText("21°");
  await page.getByRole("button", { name: "Open 3", exact: true }).click();
  await expect(page.locator(".house-temperature")).toHaveText(average, {
    useInnerText: true,
  });
});

test("camera panel captures, opens, and deletes a simulated photo", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Cameras", exact: true }).click();
  await expect(page.locator(".camera-card")).toHaveCount(12);
  await page
    .getByRole("button", { name: "Take photo", exact: true })
    .first()
    .click();
  await expect(page.locator(".photo-tile")).toHaveCount(1);
  await page.locator(".photo-tile").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog").locator("img")).toBeVisible();
  await expect
    .poll(() =>
      page
        .getByRole("dialog")
        .locator("img")
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(page.getByLabel("Photo zoom", { exact: true })).toHaveText(
    "150%",
  );
  expect(
    await page
      .locator(".photo-pan")
      .evaluate((el) => el.scrollWidth > el.clientWidth),
  ).toBe(true);
  await page.getByRole("button", { name: "Fit", exact: true }).click();
  await expect(page.getByLabel("Photo zoom", { exact: true })).toHaveText(
    "100%",
  );
  await page.getByRole("button", { name: "Delete…", exact: true }).click();
  await page
    .getByRole("button", { name: "Delete permanently", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".photo-tile")).toHaveCount(0);
});

test("temporary request cap override is visible and reversible", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const controls = page.locator("main .budget-notice");
  await controls
    .getByRole("button", { name: "Override cap for this hour" })
    .click();
  await expect(controls).toContainText(
    "Local request cap temporarily disabled",
  );
  await controls.getByRole("button", { name: "Restore request cap" }).click();
  await expect(
    controls.getByRole("button", { name: "Override cap for this hour" }),
  ).toBeVisible();
});

test("capture queue shows estimated progress and an animated active camera", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Cameras", exact: true }).click();
  await page
    .getByRole("button", { name: "Capture all (12)", exact: true })
    .click();
  await expect(
    page.getByRole("progressbar", { name: "Estimated capture progress" }),
  ).toBeVisible();
  await expect(
    page.locator(".camera-card.is-capturing .capture-spinner"),
  ).toBeVisible();
  await expect(page.locator(".capture-progress")).toContainText("remaining");
  await page.getByRole("button", { name: "Stop after current photo" }).click();
  await expect(
    page.getByRole("button", { name: "Stop after current photo" }),
  ).toHaveCount(0);
  await expect(page.locator(".capture-spinner")).toHaveCount(0);
});

test("side-panel sensor positions can be moved, persisted, and removed", async ({
  page,
}) => {
  await page.locator(".matrix-sensor").first().click();
  await expect(page.locator(".location-pin")).toHaveCount(16);
  const edit = page.getByRole("button", {
    name: "Edit sensor locations",
    exact: true,
  });
  await edit.click();
  await expect(edit).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Confirm this location" }),
  ).toBeVisible();
  const box = await page.locator(".location-plan").boundingBox();
  await page.mouse.click(box!.x + box!.width * 0.1, box!.y + box!.height * 0.1);
  await expect(page.locator(".location-pin.confirmed")).toHaveCount(1);
  const marker = await page.locator(".location-pin.confirmed").boundingBox();
  await page.mouse.move(
    marker!.x + marker!.width / 2,
    marker!.y + marker!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width * 0.3, box!.y + box!.height * 0.3, {
    steps: 8,
  });
  await page.mouse.up();
  await expect
    .poll(async () => {
      const left = await page
        .locator(".location-pin.confirmed")
        .evaluate((el) => parseFloat(getComputedStyle(el).left));
      return Math.abs(left - box!.width * 0.3);
    })
    .toBeLessThan(1);
  await page.reload();
  await page
    .getByRole("button", { name: "Start demo mode", exact: true })
    .click();
  await page.locator(".matrix-sensor").first().click();
  await expect(page.locator(".location-pin.confirmed")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Edit sensor locations", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remove from map", exact: true })
    .click();
  await expect(page.locator(".location-pin")).toHaveCount(15);
  await expect(page.locator(".location-editor")).toContainText(
    "is not on the map yet",
  );
});

test("side-panel editing supports opening assignment and saved camera direction", async ({
  page,
}) => {
  const camera = () =>
    page.locator('.matrix-sensor[aria-label^="Detector con cámara"]').first();
  await camera().click();
  await page
    .getByRole("button", { name: "Edit sensor locations", exact: true })
    .click();
  await page
    .getByLabel("Place at identified opening", { exact: true })
    .selectOption("V1");
  await expect(page.locator(".location-pin.confirmed")).toHaveCount(1);
  const direction = page.getByLabel("Camera direction", { exact: true });
  await direction.fill("90");
  await direction.press("ArrowRight");
  await expect(direction).toHaveValue("91");
  await page.reload();
  await page
    .getByRole("button", { name: "Start demo mode", exact: true })
    .click();
  await camera().click();
  await expect(page.locator(".camera-direction")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Edit sensor locations", exact: true })
    .click();
  await expect(
    page.getByLabel("Camera direction", { exact: true }),
  ).toHaveValue("91");
  await page.getByLabel("Camera direction", { exact: true }).focus();
  await page.keyboard.press("Escape");
  await expect(page.locator(".location-editor")).toHaveCount(0);
  await expect(page.locator(".location-pin.is-selected")).toHaveCount(1);
});

test("side-panel 3D view orbits, changes wall height, exports geometry, and returns to 2D", async ({
  page,
}) => {
  // With nothing selected the panel shows every floor; open the first one.
  await page.locator(".house-plan-card").first().click();
  await page.getByRole("button", { name: "3D model", exact: true }).click();
  const polygon = page.locator(".model-canvas polygon").first();
  await expect(polygon).toBeVisible();
  const before = await polygon.getAttribute("points");
  await page.getByLabel("3D orbit", { exact: true }).fill("45");
  await expect(polygon).not.toHaveAttribute("points", before!);
  await page
    .getByRole("button", { name: "Show full walls", exact: true })
    .click();
  await page.getByLabel("Assumed ceiling height", { exact: true }).fill("3");
  const downloadEvent = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export 3D model", exact: true })
    .click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("f0-estimated.obj");
  const { readFile } = await import("node:fs/promises");
  const obj = await readFile((await download.path())!, "utf8");
  expect(obj).toContain("g wall");
  expect(obj).toContain("3.00000");
  expect(obj).not.toMatch(/NaN|Infinity/);
  await expect(
    page.getByRole("button", { name: "Edit sensor locations", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "2D plan", exact: true }).click();
  await expect(page.locator(".location-pin")).toHaveCount(16);
});

test("a new photo is compared with the previous one and the changes can be inspected", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Cameras", exact: true }).click();
  const card = page.locator(".camera-card").first();
  const take = card.getByRole("button", { name: "Take photo", exact: true });
  await take.click();
  await expect(page.locator(".photo-tile")).toHaveCount(1);
  // The first photo of a camera has nothing to be compared with.
  await expect(card.locator(".camera-changes")).toHaveCount(0);
  await take.click();
  await expect(page.locator(".photo-tile")).toHaveCount(2);
  // The simulated object moved: gone from one place, new in another.
  const chip = card.locator("button.camera-changes");
  await expect(chip).toHaveText("2 possible changes");
  await expect(card.locator(".photo-change")).toHaveCount(2);
  await expect(page.locator(".photo-change-badge")).toHaveText("2");
  // Every history photo still says which camera, where and when.
  const tile = page.locator(".photo-tile").first();
  await tile.scrollIntoViewIfNeeded();
  await expect(tile.locator("strong")).toBeInViewport();
  await expect(tile.locator("> span").last()).toBeInViewport();
  await expect(tile.locator("> span").last()).toHaveText(/\d{4}-\d{2}-\d{2}/);
  await chip.click();
  const dialog = page.getByRole("dialog");
  const compare = dialog.getByRole("group", { name: "Changes", exact: true });
  await expect(compare).toContainText("2 possible changes");
  // Outlines mark places; they carry no claim about what happened there.
  await expect(dialog.locator(".photo-change")).toHaveCount(2);
  await expect(dialog.locator(".photo-changes text")).toHaveCount(0);
  // Outlines can be switched off, and the previous photo slid over this one.
  await compare.getByRole("button", { name: "Highlight", exact: true }).click();
  await expect(dialog.locator(".photo-change")).toHaveCount(0);
  await expect(dialog.locator(".photo-before")).toHaveCount(0);
  await compare.getByRole("slider").fill("50");
  await expect(dialog.locator(".photo-before")).toBeVisible();
  await expect(dialog.locator(".photo-divider")).toBeVisible();
});
