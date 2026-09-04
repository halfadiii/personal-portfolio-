/**
 * Sweeps every route at every breakpoint and reports anything a visitor would
 * actually hit: horizontal overflow, clipped text, console errors, failed
 * requests, and any response that is not what the route should return.
 *
 *   npx next start --port 3000
 *   npm run audit
 */
import { chromium } from "@playwright/test";

const BASE = process.argv[2] ?? "http://localhost:3000";
const ROUTES = [
  "/",
  "/about",
  "/resume",
  "/work/nyc-subway-reliability",
  "/work/print-inspection-cv",
  "/dashboard/bank-marketing",
  "/demo/subway",
  "/demo/print-inspection",
  "/nope",
];
const WIDTHS = [320, 390, 768, 1024, 1440];

const browser = await chromium.launch({
  args: [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});

const problems = [];

for (const width of WIDTHS) {
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    deviceScaleFactor: 1,
  });
  for (const route of ROUTES) {
    const page = await ctx.newPage();
    const msgs = [];
    page.on("console", (m) => {
      const type = m.type();
      if (type === "error" || type === "warning") {
        const text = m.text();
        if (text.includes("React DevTools")) return;
        if (text.includes("Download the React")) return;
        // The 404 route is meant to return 404; the browser logs that.
        if (route === "/nope" && text.includes("404")) return;
        msgs.push(`${type}: ${text.slice(0, 200)}`);
      }
    });
    page.on("pageerror", (e) =>
      msgs.push(`pageerror: ${e.message.slice(0, 200)}`),
    );
    page.on("requestfailed", (r) =>
      msgs.push(
        `requestfailed: ${r.url().replace(BASE, "")} ${r.failure()?.errorText ?? ""}`,
      ),
    );
    page.on("response", (r) => {
      if (r.status() >= 400 && !r.url().includes("/nope")) {
        msgs.push(`http ${r.status()}: ${r.url().replace(BASE, "")}`);
      }
    });

    await page
      .goto(BASE + route, { waitUntil: "networkidle", timeout: 45000 })
      .catch((e) => {
        msgs.push(`goto failed: ${String(e).slice(0, 120)}`);
      });
    await page
      .waitForFunction(
        () => document.documentElement.dataset.preloader !== "on",
        undefined,
        {
          timeout: 12000,
        },
      )
      .catch(() => msgs.push("preloader never handed over"));
    await page.waitForTimeout(3500);
    if (route === "/") {
      await page.evaluate(() => {
        const t = document.getElementById("trail");
        if (t) window.scrollTo(0, t.offsetTop + t.offsetHeight / 2);
      });
      await page.waitForTimeout(1500);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(600);
    }

    const layout = await page.evaluate(() => {
      const doc = document.documentElement;
      const offenders = [];
      if (doc.scrollWidth > doc.clientWidth + 1) {
        for (const el of document.querySelectorAll("body *")) {
          const box = el.getBoundingClientRect();
          if (box.width === 0 && box.height === 0) continue;
          if (box.right > doc.clientWidth + 1 || box.left < -1) {
            const s = getComputedStyle(el);
            if (s.overflowX === "auto" || s.overflowX === "scroll") continue;
            let parent = el.parentElement;
            let clipped = false;
            while (parent) {
              const ps = getComputedStyle(parent);
              if (["hidden", "clip", "auto", "scroll"].includes(ps.overflowX)) {
                clipped = true;
                break;
              }
              parent = parent.parentElement;
            }
            if (clipped) continue;
            offenders.push(
              `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 50)}`,
            );
          }
        }
      }

      // Elements whose text is clipped by a fixed-height ancestor.
      const tiny = [];
      for (const el of document.querySelectorAll(
        "h1,h2,h3,p,li,button,a,dd,dt",
      )) {
        const box = el.getBoundingClientRect();
        if (
          box.height > 0 &&
          box.width > 0 &&
          el.scrollWidth > el.clientWidth + 2
        ) {
          const s = getComputedStyle(el);
          if (s.textOverflow === "ellipsis" || s.overflow !== "visible")
            continue;
          tiny.push(
            `${el.tagName.toLowerCase()}: ${(el.textContent ?? "").slice(0, 40)}`,
          );
        }
      }

      return {
        overflow: doc.scrollWidth - doc.clientWidth,
        offenders: offenders.slice(0, 4),
        clipped: tiny.slice(0, 3),
      };
    });

    if (layout.overflow > 1) {
      problems.push(
        `${route} @${width} overflow ${layout.overflow}px :: ${layout.offenders.join(" | ")}`,
      );
    }
    if (layout.clipped.length) {
      problems.push(
        `${route} @${width} clipped text :: ${layout.clipped.join(" | ")}`,
      );
    }
    for (const m of new Set(msgs)) problems.push(`${route} @${width} ${m}`);

    await page.close();
  }
  await ctx.close();
}

await browser.close();

if (problems.length === 0) console.log("CLEAN — no issues found");
else {
  console.log(`${problems.length} ISSUES`);
  for (const p of problems) console.log("  - " + p);
}
