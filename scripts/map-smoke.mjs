// Uses an isolated demo profile and private input plans; never contacts Sector Alarm.
import { _electron as electron } from "@playwright/test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
const source = resolve(process.argv[2] || "private-house/map-project.json");
const project = JSON.parse(await readFile(source, "utf8"));
const temporary = await mkdtemp(join(tmpdir(), "home-map-smoke-"));
let app;
const launch = () =>
  electron.launch({
    args: ["."],
    env: { ...process.env, HOME_MONITOR_TEST_DATA: temporary },
  });
try {
  execFileSync(process.execPath, ["scripts/import-house-map.mjs", source], {
    env: { ...process.env, HOME_MONITOR_TEST_DATA: temporary },
  });
  app = await launch();
  let page = await app.firstWindow();
  await page.locator(".matrix-sensor").first().waitFor();
  const result = await page.evaluate(async () => {
    const map = await window.home.houseMap();
    for (const plan of map.plans) {
      const image = new Image();
      image.src = await window.home.mapImage(plan.id);
      await image.decode();
      if (!image.naturalWidth) throw new Error("Plan did not decode");
    }
    const snapshot = await window.home.snapshot();
    await window.home.saveMapPlacement(snapshot.devices[0].id, {
      planId: map.plans[0].id,
      x: 0.25,
      y: 0.35,
      confirmed: true,
      reason: "test",
    });
    return {
      plans: map.plans.length,
      requests: snapshot.requests,
      demo: snapshot.demo,
    };
  });
  assert.deepEqual(result, {
    plans: project.plans.length,
    requests: 0,
    demo: true,
  });
  await page.getByRole("button", { name: "House map", exact: true }).click();
  await page.locator(".map-pin.confirmed").waitFor();
  await app.close();
  app = await launch();
  page = await app.firstWindow();
  await page.locator(".matrix-sensor").first().waitFor();
  await page.getByRole("button", { name: "House map", exact: true }).click();
  await page.locator(".map-pin.confirmed").waitFor();
  assert.equal(
    await page.evaluate(async () => (await window.home.snapshot()).requests),
    0,
  );
  console.log(
    "Desktop map passed: all imported images decode, placement survives restart, zero live requests.",
  );
} finally {
  if (app) await app.close();
  await rm(temporary, { recursive: true, force: true });
}
