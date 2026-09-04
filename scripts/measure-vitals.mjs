/**
 * Field-style Core Web Vitals against a running build.
 *
 * Lighthouse's mobile preset simulates the critical path rather than measuring
 * it, which inflates LCP on a page shipping three self-hosted faces. This drives
 * a real Chromium under the same throttling (1.6 Mbps, 150ms RTT, 4x CPU) and
 * reads the actual PerformanceObserver entries — once with the preloader
 * running, once as a returning visitor.
 *
 *   npx next start --port 3000
 *   node scripts/measure-vitals.mjs http://localhost:3000/
 */
import { chromium } from "@playwright/test";

const url = process.argv[2] ?? "http://localhost:3000/";

async function measure(label, { skipPreloader }) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 412, height: 823 },
    deviceScaleFactor: 1.75,
    isMobile: true,
    hasTouch: true,
  });
  await context.addInitScript(() => {
    window.__lcp = null;
    window.__cls = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        window.__lcp = {
          time: e.startTime,
          tag: e.element?.tagName ?? null,
          id: e.element?.className ?? "",
        };
      }
    }).observe({ type: "largest-contentful-paint", buffered: true });
    window.__shifts = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.hadRecentInput) continue;
        window.__cls += e.value;
        const sources = (e.sources ?? []).map((s) => {
          const n = s.node;
          const moved = `${Math.round(s.previousRect.y)}→${Math.round(s.currentRect.y)}`;
          return n
            ? `${n.tagName}.${String(n.className ?? "").slice(0, 40)} ${moved}`
            : `detached ${moved}`;
        });
        window.__shifts.push({
          value: Number(e.value.toFixed(4)),
          at: Math.round(e.startTime),
          sources: sources.length ? sources : ["no sources reported"],
        });
      }
    }).observe({ type: "layout-shift", buffered: true });
  });

  if (skipPreloader) {
    await context.addInitScript(() => {
      try {
        sessionStorage.setItem("preloader-seen", "1");
      } catch {}
    });
  }
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

  await page.goto(url, { waitUntil: "load" });
  await page.waitForTimeout(5000);

  const metrics = await page.evaluate(() => {
    const fcp = performance.getEntriesByName("first-contentful-paint").at(-1);
    return {
      fcp: fcp ? Math.round(fcp.startTime) : null,
      lcp: window.__lcp ? Math.round(window.__lcp.time) : null,
      lcpEl: window.__lcp
        ? `${window.__lcp.tag}.${String(window.__lcp.id).slice(0, 40)}`
        : null,
      cls: Number(window.__cls.toFixed(4)),
      shifts: (window.__shifts ?? [])
        .sort((a, b) => b.value - a.value)
        .slice(0, 6),
    };
  });

  console.log(label, JSON.stringify(metrics));
  await browser.close();
}

await measure("with preloader   ", { skipPreloader: false });
await measure("without preloader", { skipPreloader: true });
