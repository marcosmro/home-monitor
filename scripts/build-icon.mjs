import { chromium } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
await mkdir("build", { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });
try {
  const page = await browser.newPage({
    viewport: { width: 1024, height: 1024 },
    deviceScaleFactor: 1,
  });
  const svg = await readFile("src/renderer/public/icon.svg", "utf8");
  await page.setContent(
    `<style>body{margin:0;background:transparent}svg{width:1024px;height:1024px}</style>${svg}`,
  );
  await page.screenshot({ path: "build/icon.png", omitBackground: true });
} finally {
  await browser.close();
}
