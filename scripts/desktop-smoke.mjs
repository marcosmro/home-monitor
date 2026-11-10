import { _electron as electron } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
const temporary = await mkdtemp(join(tmpdir(), "home-monitor-smoke-"));
const app = await electron.launch({
  ...(process.env.APP_EXECUTABLE
    ? { executablePath: process.env.APP_EXECUTABLE, args: [] }
    : { args: ["."] }),
  env: { ...process.env, HOME_MONITOR_TEST_DATA: temporary },
});
try {
  const page = await app.firstWindow();
  const { bounds, workArea } = await app.evaluate(({ BrowserWindow, screen }) => {
    const bounds = BrowserWindow.getAllWindows()[0].getBounds();
    return { bounds, workArea: screen.getDisplayMatching(bounds).workArea };
  });
  assert.ok(bounds.x >= workArea.x && bounds.y >= workArea.y);
  assert.ok(bounds.x + bounds.width <= workArea.x + workArea.width);
  assert.ok(bounds.y + bounds.height <= workArea.y + workArea.height);
  await page
    .getByRole("button", { name: "Start demo mode", exact: true })
    .click();
  await page.locator(".sensor-row").first().waitFor();
  assert.equal(await page.locator(".sensor-row").count(), 48);
  assert.equal(
    await page.evaluate(() => typeof window.home?.snapshot),
    "function",
  );
  assert.equal(await page.evaluate(() => typeof window.require), "undefined");
  const snapshot = await page.evaluate(() => window.home.snapshot());
  assert.equal(snapshot.demo, true);
  assert.equal(snapshot.requests, 0);
  await page.getByRole("button", { name: "Disarm", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirm disarm", exact: true })
    .click();
  await page.getByText("Confirmed by the system.", { exact: false }).waitFor();
  const saved = await page.evaluate(async () => {
    const p = await window.home.preferences();
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        window.home.savePreferences({
          ...p,
          aliases: { "demo-0": { spanish: `Puerta ${i}` } },
        }),
      ),
    );
    return window.home.preferences();
  });
  assert.equal(saved.aliases["demo-0"].spanish, "Puerta 19");
  await page.screenshot({ path: "docs/preview-desktop.png", fullPage: true });
  console.log(
    "Desktop smoke passed: sandboxed preload, 48 sensors, demo command confirmation, zero live requests.",
  );
} finally {
  await app.close();
  await rm(temporary, { recursive: true, force: true });
}
