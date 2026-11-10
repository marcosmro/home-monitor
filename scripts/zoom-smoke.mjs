import { _electron as electron, expect } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";

const temporary = await mkdtemp(join(tmpdir(), "home-monitor-zoom-"));
const app = await electron.launch({
  args: ["."],
  env: { ...process.env, HOME_MONITOR_TEST_DATA: temporary },
});
try {
  const page = await app.firstWindow();
  await page
    .getByRole("button", { name: "Start demo mode", exact: true })
    .click();
  await page.locator(".matrix-sensor").first().waitFor();
  const geometry = () =>
    page
      .locator(".rail, .topbar, .floor, .matrix-sensor")
      .evaluateAll((elements) =>
        elements.map((el) => {
          const { x, y, width, height } = el.getBoundingClientRect();
          return { x, y, width, height };
        }),
      );
  const baseline = await geometry();
  for (const factor of [1.5, 0.8]) {
    await app.evaluate(({ BrowserWindow }, zoom) => {
      BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(zoom);
    }, factor);
    await page
      .getByRole("button", { name: "Reset zoom to 100%", exact: true })
      .click();
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0].webContents.getZoomFactor(),
        ),
      )
      .toBe(1);
    await expect.poll(geometry).toEqual(baseline);
  }
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1.5);
  });
  await app.evaluate(({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0].webContents;
    const modifiers = [process.platform === "darwin" ? "meta" : "control"];
    contents.sendInputEvent({ type: "keyDown", keyCode: "0", modifiers });
    contents.sendInputEvent({ type: "keyUp", keyCode: "0", modifiers });
  });
  await expect
    .poll(() =>
      app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].webContents.getZoomFactor(),
      ),
    )
    .toBe(1);
  await expect.poll(geometry).toEqual(baseline);
  await expect(page.locator(".matrix-sensor")).toHaveCount(48);
  const columns = await page.locator(".sensor-matrix").evaluateAll((tables) =>
    tables.map((table) =>
      [...table.querySelectorAll("thead th")].map((cell) => {
        const bounds = cell.getBoundingClientRect();
        return {
          x: bounds.x - table.getBoundingClientRect().x,
          width: bounds.width,
        };
      }),
    ),
  );
  for (const row of columns.slice(1)) {
    row.forEach((cell, i) => {
      assert.ok(Math.abs(cell.x - columns[0][i].x) < 1);
      assert.ok(Math.abs(cell.width - columns[0][i].width) < 1);
    });
  }
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({
    path: "/tmp/home-monitor-zoom-100.png",
    fullPage: true,
  });
  console.log(
    "Zoom smoke passed: button and shortcut restore 100%, baseline geometry and matrix columns align.",
  );
} finally {
  await app.close();
  await rm(temporary, { recursive: true, force: true });
}
