import { test, expect, type Page } from "@playwright/test";
import { demoSnapshot } from "../../src/shared/demo";
import { defaults, type Snapshot } from "../../src/shared/model";

async function openMonitor(page: Page, snap: Snapshot) {
  snap.demo = false;
  snap.devices[0].alarm = true;
  await page.addInitScript(
    ({ snap, prefs }) => {
      window.home = {
        snapshot: async () => snap,
        preferences: async () => prefs,
        subscribe: () => () => {},
        houseMap: async () => ({ plans: [], rooms: [], placements: {} }),
      } as unknown as typeof window.home;
    },
    { snap, prefs: { ...defaults, language: "es" } },
  );
  await page.goto("/");
  return page.locator(".alarm-strip");
}

test("a closed sensor alert preserves the panel mode and scopes the history to loaded events", async ({
  page,
}) => {
  const snap = demoSnapshot();
  const strip = await openMonitor(page, snap);
  await expect(strip.getByRole("heading")).toHaveText("Totalmente activada");
  await expect(strip).toContainText("Contacto cerrado · aviso activo");
  await expect(strip).toContainText(
    "Sin eventos de intrusión en los 4 registros consultados",
  );
});

test("a later routine event does not hide the dated home intrusion record", async ({
  page,
}) => {
  const snap = demoSnapshot();
  snap.events[1].type = "alarm_burglary_confirmed";
  snap.events[1].time = "2026-11-20T09:15:00Z";
  const strip = await openMonitor(page, snap);
  await expect(strip).toContainText(
    "Alarma de intrusión confirmada por Sector Alarm",
  );
  await expect(strip).toContainText("2026-11-20 · 10:15:00");
});

test("a failed history refresh does not imply a clear history", async ({
  page,
}) => {
  const snap = demoSnapshot();
  snap.warnings.events = "Unavailable";
  const strip = await openMonitor(page, snap);
  await expect(strip).toContainText("No se pudo verificar");
  await expect(strip).not.toContainText("Sin eventos de intrusión");
});

test("sensor information highlights the individual abnormal readings", async ({
  page,
}) => {
  const snap = demoSnapshot();
  Object.assign(snap.devices[0], {
    batteryCritical: true,
    temperature: 32,
    bypass: true,
  });
  const strip = await openMonitor(page, snap);
  await strip.locator(".alert-sensor-link").click();
  const information = page.locator(".sensor-information");
  const row = (label: string) =>
    information.locator("dl > div").filter({
      has: page.getByText(label, { exact: true }).first(),
    });
  await expect(information).toHaveAttribute("open", "");
  await expect(row("Alerta del sensor")).toHaveAttribute(
    "data-severity",
    "attention",
  );
  await expect(row("Batería")).toHaveAttribute("data-severity", "critical");
  await expect(row("Excluido del armado")).toHaveAttribute(
    "data-severity",
    "attention",
  );
  await expect(row("Temperatura")).toContainText(
    "Fuera de la escala configurada",
  );
  await expect(row("Estado de apertura")).not.toHaveAttribute("data-severity");
});

test("the full Spanish activity value fits inside the map summary", async ({
  page,
}) => {
  await openMonitor(page, demoSnapshot());
  await page.locator(".matrix-sensor").first().click();
  const summary = page.locator(".map-sensor-summary");
  const value = summary.getByText("Contacto cerrado · aviso activo", {
    exact: true,
  });
  await expect(value).toBeVisible();
  for (const width of [1800, 1000]) {
    await page.setViewportSize({ width, height: 1000 });
    const fits = await value.evaluate((element) => {
      const panel = element.closest("aside")!.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(element);
      return Array.from(range.getClientRects()).every(
        (line) => line.left >= panel.left && line.right <= panel.right,
      );
    });
    expect(fits).toBe(true);
  }
});
