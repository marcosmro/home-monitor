import { test, expect } from "@playwright/test";

test("UI language switches independently of names and persists", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Start demo mode", exact: true })
    .click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Display names", exact: true })
    .selectOption("original");
  await page
    .getByRole("combobox", { name: "Language", exact: true })
    .selectOption("es");
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(
    page.getByRole("heading", { name: "Ajustes", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Nombres mostrados", exact: true }),
  ).toHaveValue("original");
  await page
    .getByRole("button", { name: "Vista general", exact: true })
    .click();
  await expect(page.locator(".sensor-row")).toHaveCount(48);
  await expect(page.locator(".coverage")).toContainText(
    "Mostrando los 48 sensores disponibles",
  );
  await page.getByRole("button", { name: "Desactivar", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Solo afecta a la demostración.",
  );
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.getByRole("button", { name: "Cámaras", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Capturar todas" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  const start = page.getByRole("button", { name: "Iniciar demo", exact: true });
  if (await start.isVisible()) await start.click();
  await page.getByRole("button", { name: "Ajustes", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Idioma", exact: true }),
  ).toHaveValue("es");
  await page
    .getByRole("combobox", { name: "Idioma", exact: true })
    .selectOption("en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(
    page.getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible();
});
