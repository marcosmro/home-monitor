// Isolated demo profile only. Never logs in or contacts a live camera.
import { _electron as electron } from "@playwright/test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
const temporary = await mkdtemp(join(tmpdir(), "home-monitor-camera-"));
const launch = () =>
  electron.launch({
    executablePath:
      "dist/mac-arm64/Home Monitor.app/Contents/MacOS/Home Monitor",
    args: [],
    env: { ...process.env, HOME_MONITOR_TEST_DATA: temporary },
  });
let app;
try {
  app = await launch();
  let page = await app.firstWindow();
  await page.locator(".sensor-row").first().waitFor();
  await page.getByRole("button", { name: "Cameras", exact: true }).click();
  await page
    .getByRole("button", { name: "Take photo", exact: true })
    .first()
    .click();
  await page.locator(".photo-tile").first().waitFor();
  assert.equal((await page.evaluate(() => window.home.snapshot())).requests, 0);
  await app.close();
  app = await launch();
  page = await app.firstWindow();
  await page.locator(".sensor-row").first().waitFor();
  await page.getByRole("button", { name: "Cameras", exact: true }).click();
  await page.locator(".photo-tile").first().waitFor();
  assert.equal(await page.locator(".photo-tile").count(), 1);
  await page.locator(".photo-tile").click();
  await page.getByRole("dialog").locator("img").waitFor();
  assert.equal(
    await page
      .getByRole("dialog")
      .locator("img")
      .evaluate((img) => img.complete && img.naturalWidth > 0),
    true,
  );
  const exported = join(temporary, "exported.png");
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
  }, exported);
  await page
    .getByRole("button", { name: "Export photo…", exact: true })
    .click();
  await page.waitForFunction(
    () => !document.querySelector(".photo-viewer-actions button")?.disabled,
  );
  assert.equal(
    (await readFile(exported)).subarray(0, 8).toString("hex"),
    "89504e470d0a1a0a",
  );
  await page.getByRole("button", { name: "Delete…", exact: true }).click();
  await page
    .getByRole("button", { name: "Delete permanently", exact: true })
    .click();
  await page.waitForFunction(
    async () => (await window.home.photoLibrary()).total === 0,
  );
  assert.equal((await page.evaluate(() => window.home.snapshot())).requests, 0);
  console.log(
    "Camera desktop check passed: simulated capture, persisted across restart, decoded image, export, deletion; zero live requests.",
  );
} finally {
  await app?.close().catch(() => {});
  await rm(temporary, { recursive: true, force: true });
}
