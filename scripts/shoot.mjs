/**
 * Screenshot harness for the §0 critique loop.
 *
 *   node scripts/shoot.mjs [--url http://localhost:3000] [--routes /,/resume]
 *                          [--widths 390,768,1440] [--out .shots] [--reduced]
 *
 * Writes <out>/<route>--<width>.png and prints any console errors and any
 * route/width that scrolls horizontally, which §2.1 forbids.
 */
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith("--"))
    .map((a) => {
      const [k, v] = a.replace(/^--/, "").split("=");
      return [k, v ?? true];
    }),
);

const baseUrl = args.url ?? "http://localhost:3000";
const routes = String(args.routes ?? "/,/resume").split(",");
const widths = String(args.widths ?? "390,768,1440")
  .split(",")
  .map(Number);
const outDir = path.resolve(String(args.out ?? ".shots"));
const reduced = Boolean(args.reduced);
const viewportOnly = Boolean(args.viewport);
const scrollTo = args.scrollTo ? Number(args.scrollTo) : 0;

const slug = (route) =>
  route === "/" ? "home" : route.replace(/^\//, "").replace(/\//g, "-");

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const problems = [];

for (const width of widths) {
  const context = await browser.newContext({
    viewport: { width, height: Math.round(width * 0.72) + 300 },
    deviceScaleFactor: 1,
    reducedMotion: reduced ? "reduce" : "no-preference",
  });

  for (const route of routes) {
    const page = await context.newPage();
    const consoleErrors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) =>
      consoleErrors.push(`pageerror: ${err.message}`),
    );

    const response = await page.goto(`${baseUrl}${route}`, {
      waitUntil: "networkidle",
      timeout: 45_000,
    });
    if (!response || !response.ok()) {
      problems.push(
        `${route} @${width} → HTTP ${response ? response.status() : "no response"}`,
      );
    }

    await page.waitForTimeout(reduced ? 300 : 2200);

    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      const offenders = [];
      if (doc.scrollWidth > doc.clientWidth + 1) {
        for (const el of document.querySelectorAll("body *")) {
          const box = el.getBoundingClientRect();
          if (box.width === 0 && box.height === 0) continue;
          if (box.right > doc.clientWidth + 1 || box.left < -1) {
            const style = getComputedStyle(el);
            if (style.overflowX === "auto" || style.overflowX === "scroll")
              continue;
            offenders.push(
              `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} → ${Math.round(box.left)}..${Math.round(box.right)}`,
            );
          }
        }
      }
      return {
        scrollWidth: doc.scrollWidth,
        clientWidth: doc.clientWidth,
        offenders: offenders.slice(0, 6),
      };
    });

    if (overflow.scrollWidth > overflow.clientWidth + 1) {
      problems.push(
        `${route} @${width} → horizontal overflow ${overflow.scrollWidth}>${overflow.clientWidth}\n    ${overflow.offenders.join("\n    ")}`,
      );
    }
    for (const err of consoleErrors) {
      problems.push(`${route} @${width} → console: ${err}`);
    }

    if (scrollTo) {
      await page.evaluate((y) => window.scrollTo(0, y), scrollTo);
      await page.waitForTimeout(400);
    }
    await page.screenshot({
      path: path.join(outDir, `${slug(route)}--${width}.png`),
      fullPage: !viewportOnly,
    });
    await page.close();
  }

  await context.close();
}

await browser.close();

if (problems.length) {
  console.log("PROBLEMS");
  for (const p of problems) console.log(`  - ${p}`);
  process.exitCode = 1;
} else {
  console.log(`OK — shots in ${outDir}`);
}
