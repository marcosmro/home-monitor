import { test, expect } from "@playwright/test";
import { demoSnapshot } from "../../src/shared/demo";
import { defaults } from "../../src/shared/model";
import { demoMap } from "../../src/shared/demo-map";

test("numeric temperatures remain independent of temperature color settings", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Start demo mode", exact: true })
    .click();
  await expect(page.locator(".matrix-temperature")).toHaveCount(12);
  await expect(page.locator(".matrix-sensor > svg")).toHaveCount(36);
  const sensor = page
    .locator(".matrix-sensor")
    .filter({ has: page.locator(".matrix-temperature") })
    .first();
  const initialClass = await sensor.getAttribute("class");
  const initialColor = await sensor.evaluate(
    (el) => getComputedStyle(el).backgroundColor,
  );
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Cool end (°C)", { exact: true }).fill("26");
  await page.getByLabel("Warm end (°C)", { exact: true }).fill("20");
  await expect(
    page.getByRole("button", { name: "Apply temperature range" }),
  ).toBeDisabled();
  await page.getByLabel("Cool end (°C)", { exact: true }).fill("18");
  await page.getByLabel("Warm end (°C)", { exact: true }).fill("26");
  await page.getByRole("button", { name: "Apply temperature range" }).click();
  await page
    .locator(".temperature-settings")
    .screenshot({ path: "/tmp/home-temperature-settings.png" });
  await page.reload();
  await page
    .getByRole("button", { name: "Start demo mode", exact: true })
    .click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("Cool end (°C)", { exact: true })).toHaveValue(
    "18",
  );
  await expect(page.getByLabel("Warm end (°C)", { exact: true })).toHaveValue(
    "26",
  );
  await page
    .getByRole("button", { name: "House overview", exact: true })
    .click();
  expect(await sensor.getAttribute("class")).toBe(initialClass);
  expect(
    await sensor.evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe(initialColor);
  await page.screenshot({
    path: "/tmp/home-temperature-rings.png",
    fullPage: true,
  });
});

test("matrix defaults to a tabbed inspector and preserves sensor and map selection", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Start demo mode", exact: true })
    .click();
  await expect(page.getByRole("group", { name: "Sensor view" })).toHaveCount(0);
  await expect(
    page.getByRole("combobox", { name: "Display names" }),
  ).toHaveCount(0);
  await expect(page.locator(".matrix-sensor")).toHaveCount(48);
  await expect(
    page.getByRole("tab", { name: "Floor plan", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toHaveCount(1);
  await page.locator(".matrix-sensor").nth(16).click();
  await expect(
    page.getByRole("tab", { name: "Details", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("complementary", { name: "Sensor details" }),
  ).toBeVisible();
  await expect(page.locator(".sensor-location")).toBeHidden();
  await page.getByRole("tab", { name: "Floor plan", exact: true }).click();
  await expect(page.locator(".location-plan")).toHaveAttribute(
    "data-plan-id",
    "f1",
  );
  await expect(page.locator(".location-pin.is-selected")).toHaveCount(1);
  await page
    .getByRole("button", {
      name: "Show Despacho, Primera planta on floor plan",
      exact: true,
    })
    .click();
  await expect(
    page.locator(".location-rooms polygon.is-selected"),
  ).toHaveAttribute("aria-label", "Show room Despacho");
  await page.locator(".location-pin").nth(8).click();
  await expect(
    page.getByRole("tab", { name: "Floor plan", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Details", exact: true }).click();
  await expect(page.locator(".detail-panel > p")).toContainText("Despacho");
  await page
    .getByRole("tab", { name: "Details", exact: true })
    .press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Floor plan", exact: true }),
  ).toBeFocused();
  await expect(page.getByRole("tabpanel")).toHaveCount(1);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "/tmp/home-tabbed-map.png", fullPage: true });
});

test("bottom day strip routes events into the activity tab without growing", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Start demo mode", exact: true })
    .click();
  const workspace = (await page.locator(".matrix-dashboard").boundingBox())!;
  const strip = (await page.locator(".activity-strip").boundingBox())!;
  expect(strip.y).toBeGreaterThanOrEqual(workspace.y + workspace.height);
  expect(strip.height).toBeLessThan(160);
  await page.locator(".matrix-sensor").nth(10).click();
  await page.locator(".calendar-days .has-events").first().click();
  await expect(
    page.getByRole("tab", { name: "Activity", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toHaveCount(1);
  await expect(
    page.locator(".activity-strip .calendar-event-list"),
  ).toHaveCount(0);
  expect((await page.locator(".activity-strip").boundingBox())!.height).toBe(
    strip.height,
  );
  await page
    .getByRole("button", { name: "Selected sensor", exact: true })
    .click();
  // The demo's events can straddle Madrid midnight; select a day that
  // actually contains this sensor's activity after narrowing the scope.
  await page.locator(".calendar-days .has-events").first().click();
  await expect(page.locator(".calendar-event-list article")).toHaveCount(1);
  await expect(page.locator(".calendar-event-list")).toContainText(
    "Low sensor battery",
  );
  await page.getByRole("tab", { name: "Floor plan", exact: true }).click();
  await page.getByRole("tab", { name: "Activity", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Selected sensor", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.locator(".calendar-event-list article button").click();
  await expect(
    page.getByRole("tab", { name: "Details", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page
    .getByRole("button", { name: "Previous month", exact: true })
    .click();
  await expect(page.locator(".activity-day-empty")).toBeVisible();
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(page.locator(".calendar-days .is-today")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.screenshot({
    path: "/tmp/home-tabbed-activity.png",
    fullPage: true,
  });
});

test("filtering and responsive tabs retain inventory without page overflow", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Start demo mode", exact: true })
    .click();
  await page.getByRole("button", { name: "Open 3", exact: true }).click();
  await expect(page.locator(".matrix-sensor")).toHaveCount(3);
  await page
    .getByRole("button", { name: "All sensors 48", exact: true })
    .click();
  for (const width of [1440, 1100, 600]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(page.locator(".matrix-sensor")).toHaveCount(48);
    await page.locator(".matrix-sensor").first().click();
    await expect(page.getByRole("tabpanel")).toHaveCount(1);
    await page.getByRole("tab", { name: "Floor plan", exact: true }).click();
    await expect(page.locator(".location-pin.is-selected")).toHaveCount(1);
  }
  await page
    .getByRole("button", { name: "Toggle light and dark theme" })
    .click();
  await page.screenshot({
    path: "/tmp/home-tabbed-small-dark.png",
    fullPage: true,
  });
  await expect(page.locator(".matrix-sensor")).toHaveCount(48);
});

test("busy days scroll inside Activity rather than stretching the workspace", async ({
  page,
}) => {
  const snap = demoSnapshot();
  snap.demo = false;
  snap.events = Array.from({ length: 240 }, (_, i) => ({
    id: `event-${i}`,
    type: "test",
    time: new Date().toISOString(),
    description: `Event ${i + 1}`,
  }));
  await page.addInitScript(
    ({ snap, prefs }) => {
      window.home = {
        snapshot: async () => snap,
        preferences: async () => prefs,
        subscribe: () => () => {},
        houseMap: async () => ({ plans: [], rooms: [], placements: {} }),
      } as unknown as typeof window.home;
    },
    { snap, prefs: defaults },
  );
  await page.goto("/");
  await page.locator(".calendar-days .is-today").click();
  await expect(page.locator(".calendar-event-list article")).toHaveCount(240);
  const panel = page.getByRole("tabpanel", { name: "Activity", exact: true });
  const dimensions = await panel.evaluate((el) => ({
    height: el.clientHeight,
    content: el.scrollHeight,
  }));
  expect(dimensions.height).toBeLessThanOrEqual(790);
  expect(dimensions.content).toBeGreaterThan(dimensions.height);
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight),
  ).toBeLessThan(2000);
  await panel.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect(page.getByText("Event 240", { exact: true })).toBeInViewport();
});

test("removed search shortcut leaves the current view unchanged and Escape dismisses only the tooltip", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Start demo mode", exact: true })
    .click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.keyboard.press("Control+k");
  await expect(
    page.getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "House overview", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Find a sensor or room" }),
  ).toHaveCount(0);
  await page.locator(".matrix-sensor").nth(16).click();
  await page.locator(".matrix-sensor").nth(17).hover();
  await expect(page.getByRole("tooltip")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await expect(page.locator('.matrix-sensor[aria-pressed="true"]')).toHaveCount(
    1,
  );
});

test("small-screen matrix selection reveals and focuses the inspector", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 850 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Start demo mode", exact: true })
    .click();
  await page.locator(".matrix-sensor").nth(16).click();
  await expect(
    page.getByRole("tab", { name: "Details", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("tab", { name: "Details", exact: true }),
  ).toBeInViewport();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

test("floor-plan load errors offer an inline recovery action", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.setItem("demo-map-placements", "invalid json"),
  );
  await page
    .getByRole("button", { name: "Start demo mode", exact: true })
    .click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Could not load the floor plan" }),
  ).toBeVisible();
  await page.evaluate(() => localStorage.removeItem("demo-map-placements"));
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.locator(".location-plan")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry", exact: true }),
  ).toHaveCount(0);
});

test("floor plan fills the matching panel and ignores hover and passive focus", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Start demo mode", exact: true })
    .click();
  const matrix = page.locator(".matrix-panel");
  const context = page.locator(".sensor-context");
  await expect
    .poll(async () =>
      Math.abs(
        (await matrix.boundingBox())!.height -
          (await context.boundingBox())!.height,
      ),
    )
    .toBeLessThan(2);
  await expect
    .poll(
      async () => (await page.locator(".location-plan").boundingBox())!.height,
    )
    .toBeGreaterThan(250);
  await page.locator(".matrix-sensor").first().click();
  await page.getByRole("tab", { name: "Floor plan", exact: true }).click();
  const selection = await page
    .locator('.matrix-sensor[aria-pressed="true"]')
    .getAttribute("aria-label");
  await page.locator(".matrix-sensor").nth(16).hover();
  await expect(page.getByRole("tooltip")).toBeVisible();
  await expect(page.locator(".location-plan")).toHaveAttribute(
    "data-plan-id",
    "f0",
  );
  await expect(
    page.locator('.matrix-sensor[aria-pressed="true"]'),
  ).toHaveAttribute("aria-label", selection!);
  await page.locator(".matrix-sensor").nth(16).focus();
  await expect(page.locator(".location-plan")).toHaveAttribute(
    "data-plan-id",
    "f0",
  );
  await page.locator(".matrix-sensor").nth(16).press("Enter");
  await page.getByRole("tab", { name: "Floor plan", exact: true }).click();
  await expect(page.locator(".location-plan")).toHaveAttribute(
    "data-plan-id",
    "f1",
  );
  await expect(page.locator(".location-pin.is-selected")).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 850 });
  await expect
    .poll(
      async () => (await page.locator(".location-plan").boundingBox())!.width,
    )
    .toBeGreaterThan(250);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
});

test("portrait floor plans use panel height and preserve their proportions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  const map = demoMap();
  const plan = map.plans[0];
  plan.width = 500;
  plan.height = 1000;
  if (plan.drawing) plan.drawing.bounds = [0, 0, 500, 1000];
  await page.addInitScript(
    ({ snap, prefs, map }) => {
      window.home = {
        snapshot: async () => snap,
        preferences: async () => prefs,
        subscribe: () => () => {},
        houseMap: async () => ({ ...map, placements: {} }),
      } as unknown as typeof window.home;
    },
    { snap: { ...demoSnapshot(), demo: false }, prefs: defaults, map },
  );
  await page.goto("/");
  await expect
    .poll(
      async () =>
        (await page.locator(".location-plan").boundingBox())?.height || 0,
    )
    .toBeGreaterThan(500);
  const box = (await page.locator(".location-plan").boundingBox())!;
  expect(box.width / box.height).toBeCloseTo(0.5, 2);
  const matrix = (await page.locator(".matrix-panel").boundingBox())!;
  const inspector = (await page.locator(".sensor-context").boundingBox())!;
  expect(inspector.height).toBeCloseTo(matrix.height, 0);
  await page.screenshot({
    path: "/tmp/home-plan-portrait.png",
    fullPage: true,
  });
});

test("desktop overview keeps the activity strip visible and sensors reachable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1800, height: 1200 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Start demo mode", exact: true })
    .click();
  const scroll = page.locator(".matrix-scroll");
  expect(
    await scroll.evaluate((el) => el.scrollHeight <= el.clientHeight),
  ).toBe(true);
  for (const [width, height] of [
    [1800, 1200],
    [1440, 900],
    [1280, 800],
    [1024, 768],
  ]) {
    await page.setViewportSize({ width, height });
    await expect(page.locator(".activity-strip")).toBeInViewport({ ratio: 1 });
    expect(
      await page.evaluate(() => document.documentElement.scrollHeight),
    ).toBeLessThanOrEqual(height);
    const left = (await page.locator(".matrix-panel").boundingBox())!;
    const right = (await page.locator(".sensor-context").boundingBox())!;
    expect(left.height).toBeCloseTo(right.height, 0);
  }
  await scroll.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect(page.locator(".matrix-sensor").last()).toBeInViewport();
  await page.locator(".matrix-sensor").last().click();
  await expect(page.locator(".activity-strip")).toBeInViewport({ ratio: 1 });
});

test("floor headings navigate the clean map panel by click and keyboard", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Start demo mode", exact: true })
    .click();
  const plan = page.locator(".location-plan");
  await expect(page.getByLabel("Preview floor", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.locator(".location-context, .location-heading"),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Show floor Primera planta", exact: true })
    .click();
  await expect(plan).toHaveAttribute("data-plan-id", "f1");
  await expect(
    page.getByRole("tab", { name: "Floor plan", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  const basement = page.getByRole("button", {
    name: "Show floor Sótano",
    exact: true,
  });
  await basement.focus();
  await expect(plan).toHaveAttribute("data-plan-id", "f1");
  await basement.press("Enter");
  await expect(plan).toHaveAttribute("data-plan-id", "f2");
  await expect(basement).toHaveAttribute("aria-pressed", "true");
  await page.locator(".matrix-sensor").first().click();
  await page.getByRole("tab", { name: "Floor plan", exact: true }).click();
  await expect(plan).toHaveAttribute("data-plan-id", "f0");
  await expect(page.locator(".location-pin.is-selected")).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 850 });
  await page
    .getByRole("button", { name: "Show floor Primera planta", exact: true })
    .click();
  await expect(plan).toHaveAttribute("data-plan-id", "f1");
  await expect(
    page.getByRole("tab", { name: "Floor plan", exact: true }),
  ).toBeInViewport();
});
