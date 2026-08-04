import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

/**
 * Lightweight component-screenshot tool. Boots a standalone Vite server
 * that renders the app's real components in isolation (no Next server,
 * no backend), then drives headless Chromium to screenshot each story at
 * mobile + desktop widths. Output lands in ./out.
 *
 * Usage:
 *   pnpm screenshots                      # all stories, light, both viewports
 *   pnpm screenshots fields-gallery       # one story
 *   pnpm screenshots --dark               # also capture dark theme
 */

const outUrl = (name) => new URL(`./out/${name}`, import.meta.url);

const ALL_STORIES = ["fields-form", "fields-table", "fields-gallery"];
const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  desktop: { width: 1280, height: 900 },
};

const argv = process.argv.slice(2);
const dark = argv.includes("--dark");
const picked = argv.filter((a) => !a.startsWith("--"));
const stories = picked.length ? picked : ALL_STORIES;
const themes = dark ? ["light", "dark"] : ["light"];

const server = await createServer({
  configFile: fileURLToPath(new URL("./vite.config.ts", import.meta.url)),
});
await server.listen();
const base = server.resolvedUrls?.local?.[0] ?? "http://localhost:5199/";
console.log(`harness serving at ${base}`);

await mkdir(new URL("./out/", import.meta.url), { recursive: true });
const browser = await chromium.launch();
const failures = [];
try {
  for (const story of stories) {
    for (const theme of themes) {
      for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
        // Emulate touch on the mobile viewport so `@media (pointer: coarse)`
        // matches (touch-target sizing) and `hover:` styles resolve as they do
        // on a real phone (no hover). Desktop stays a fine pointer.
        const page = await browser.newPage({
          viewport,
          deviceScaleFactor: 2,
          hasTouch: vpName === "mobile",
          isMobile: vpName === "mobile",
        });
        const errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        const query = new URLSearchParams({ story, theme });
        await page.goto(`${base}?${query}`, { waitUntil: "load" });
        // Give fonts / the rich-text editor a beat to settle.
        await page.waitForTimeout(600);
        const suffix = theme === "dark" ? `-${vpName}-dark` : `-${vpName}`;
        const name = `${story}${suffix}.png`;
        await page.screenshot({
          path: fileURLToPath(outUrl(name)),
          fullPage: true,
        });
        await page.close();
        if (errors.length) {
          failures.push(`${name}: ${errors.join(" | ")}`);
          console.log(`⚠ ${name} (page errors)`);
        } else {
          console.log(`✓ ${name}`);
        }
      }
    }
  }
} finally {
  await browser.close();
  await server.close();
}

if (failures.length) {
  console.error(`\nPage errors:\n${failures.join("\n")}`);
  process.exit(1);
}
console.log(`\nDone → tools/screenshots/out`);
