// Explicit, read-only diagnostic. Uses the application's saved-account bridge;
// never reads or prints credentials and never enables/sends alarm commands.
import { _electron as electron } from "@playwright/test";
const app = await electron.launch({
  executablePath:
    process.env.APP_EXECUTABLE ||
    "dist/mac-arm64/Home Monitor.app/Contents/MacOS/Home Monitor",
  args: [],
});
try {
  const page = await app.firstWindow();
  await page.locator(".sensor-row").first().waitFor();
  const summary = await page.evaluate(async () => {
    try {
      const panels = await window.home.savedLogin();
      if (panels.length !== 1)
        return {
          result: "Property selection required",
          properties: panels.length,
        };
      const s = await window.home.select(panels[0].id);
      return {
        result: "Read-only connection checked",
        readOnly: s.readOnly,
        mode: s.mode,
        areas: s.areas.map((a) => ({
          mode: a.mode,
          reportedMode: a.reportedMode,
          partial: a.partial,
        })),
        contacts: s.devices.filter((d) => d.closed !== undefined).length,
        mounts: s.devices.reduce((counts, d) => {
          const k = d.mount || "not reported";
          counts[k] = (counts[k] || 0) + 1;
          return counts;
        }, {}),
        reportedMountValues: [
          ...new Set(
            s.devices
              .map((d) => d.reportedMount)
              .filter((v) => v !== undefined),
          ),
        ],
        mountIndicesProvided: s.devices.filter(
          (d) => d.mountIndex !== undefined,
        ).length,
        temperatureReadings: s.devices.filter(
          (d) => d.temperature !== undefined,
        ).length,
        houseTemperature: s.climate?.houseAverage,
        roomTemperatureAverages: Object.keys(s.climate?.roomAverages || {})
          .length,
        online: s.online,
        vendor: s.vendor,
        sensors: s.devices.length,
        types: [...new Set(s.devices.map((d) => d.type))],
        floors: new Set(s.devices.map((d) => d.floorId)).size,
        warnings: s.warnings,
        requests: s.requests,
      };
    } catch (e) {
      return { result: "Connection check stopped", message: e.message };
    }
  });
  console.log(JSON.stringify(summary, null, 2));
  await page.screenshot({
    path: "/tmp/home-monitor-live-check.png",
    fullPage: true,
  });
  if (process.argv.includes("--keep-open"))
    await new Promise((resolve) => app.on("close", resolve));
} finally {
  await app.close().catch(() => {});
}
