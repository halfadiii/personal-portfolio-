/**
 * Is it smooth? — frame times against a running build.
 *
 * The average frame rate is the one number that cannot answer that question:
 * a page that holds 60 and stalls for a third of a second twice still averages
 * 58, and the stalls are the entire complaint. So this reports the shape of
 * the distribution — the median, the tail, and the worst single frame — for
 * each thing a visitor actually does, and counts the long tasks that caused
 * them.
 *
 * Read `>32ms` as "frames a visitor would see as a stutter" and `worst` as
 * "the longest the page was frozen". Both should be near zero everywhere
 * except the first half-second of a cold load, which is hydration and is not
 * avoidable.
 *
 *   npm run build && npx next start --port 3100
 *   node scripts/measure-frames.mjs http://localhost:3100
 *   node scripts/measure-frames.mjs http://localhost:3100 1 phone
 *   node scripts/measure-frames.mjs http://localhost:3100 4 phone
 *
 * `phone` measures at a handset's viewport, density and input model; the
 * number before it slows the CPU down by that factor, which is the closest
 * this machine gets to standing in for a weaker one.
 *
 * Headless Chromium renders through a software rasteriser and does not wait on
 * the GPU, so its frame times only describe main-thread work. `headed` uses
 * the real GPU and is the one to trust for anything drawn.
 */
import { chromium } from "@playwright/test";

const args = process.argv
  .slice(2)
  .filter((a) => a !== "phone" && a !== "headless");
const BASE = args[0] ?? "http://localhost:3100";
/** CPU slowdown multiplier, for standing in for a weaker machine. */
const THROTTLE = Number(args[1] ?? 1);
const HEADLESS = process.argv.includes("headless");
/**
 * `phone` measures at a phone's viewport, pixel density and input model, so
 * the scenes run in the configuration a phone puts them in: coarse pointer, no
 * smooth scroll, no cursor, and three device pixels per CSS pixel for the
 * canvases to cap. It is still this machine's GPU — a real handset is slower —
 * so read it as the shape of the work, not as a handset's frame rate.
 */
const PHONE = process.argv.includes("phone");
const DEVICE = PHONE
  ? {
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    }
  : { viewport: { width: 1512, height: 900 } };

const RECORDER = () => {
  window.__frames = [];
  window.__long = [];
  let last = performance.now();
  const tick = (now) => {
    window.__frames.push(now - last);
    last = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__long.push(Math.round(entry.duration));
      }
    }).observe({ type: "longtask", buffered: true });
  } catch {
    // No long-task observer here; the frame times still tell the story.
  }
  window.__reset = () => {
    window.__frames.length = 0;
    window.__long.length = 0;
  };
};

function stats(list) {
  if (list.length === 0) return {};
  const sorted = [...list].sort((a, b) => a - b);
  const at = (q) =>
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
  return {
    n: sorted.length,
    p50: +at(0.5).toFixed(1),
    p95: +at(0.95).toFixed(1),
    p99: +at(0.99).toFixed(1),
    max: +sorted[sorted.length - 1].toFixed(1),
    over32: sorted.filter((v) => v > 32).length,
  };
}

async function run(label, path, act, { cold = false } = {}) {
  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext(DEVICE);
  // Every run but the first is a returning visitor, so the sequence is skipped.
  if (!cold) {
    await context.addInitScript(() => {
      try {
        sessionStorage.setItem("preloader-seen", "1");
      } catch {
        // Private browsing: the sequence runs, and this run measures it too.
      }
    });
  }
  await context.addInitScript(RECORDER);

  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  if (THROTTLE > 1) {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });
  }
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error).slice(0, 160)));

  await page.goto(BASE + path, { waitUntil: "load" });
  await act(page);

  const frames = await page.evaluate(() => window.__frames.slice());
  const long = await page.evaluate(() => window.__long.slice());
  await browser.close();

  return {
    label,
    frames: stats(frames),
    long: { count: long.length, total: long.reduce((a, b) => a + b, 0) },
    errors,
  };
}

const wait = (page, ms) => page.waitForTimeout(ms);
/** Let the page settle, then start counting from a clean slate. */
const settle = async (page, ms = 2500) => {
  await wait(page, ms);
  await page.evaluate(() => window.__reset());
};
const wheel = async (page, steps, dy = 150) => {
  for (let i = 0; i < steps; i += 1) {
    await page.mouse.wheel(0, dy);
    await wait(page, 24);
  }
};

const results = [];

results.push(
  await run("loading screen", "/", (page) => wait(page, 5600), { cold: true }),
);
results.push(
  await run("hero idle", "/", async (page) => {
    await settle(page);
    await wait(page, 4000);
  }),
);
results.push(
  await run("hero drag", "/", async (page) => {
    await settle(page);
    const { width, height } = DEVICE.viewport;
    const y = Math.round(height * 0.55);
    await page.mouse.move(width / 2, y);
    await page.mouse.down();
    for (let i = 0; i < 60; i += 1) {
      await page.mouse.move(width / 2 + Math.sin(i / 8) * (width * 0.2), y);
      await wait(page, 12);
    }
    await page.mouse.up();
    await wait(page, 1200);
  }),
);
results.push(
  await run("home scroll", "/", async (page) => {
    await settle(page);
    await wheel(page, 120, 160);
    await wait(page, 800);
  }),
);
results.push(
  await run("case study", "/work/nyc-subway-reliability", async (page) => {
    await settle(page, 2200);
    await wheel(page, 80, 170);
    await wait(page, 800);
  }),
);
results.push(
  await run("print demo", "/demo/print-inspection", async (page) => {
    await settle(page);
    await wait(page, 4000);
  }),
);
results.push(
  await run("subway demo", "/demo/subway", async (page) => {
    await settle(page);
    await wait(page, 4000);
  }),
);
// The network map sits further down that page, and only draws while it is on
// screen — so it has to be scrolled to before there is anything to measure.
results.push(
  await run("network map", "/demo/subway", async (page) => {
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
      const map = document.querySelector(
        "[data-cursor-shape='off']:last-of-type",
      );
      map?.scrollIntoView({ block: "center" });
    });
    await settle(page, 2500);
    await wait(page, 4000);
  }),
);

const mode = HEADLESS ? "headless (main thread only)" : "headed (real GPU)";
const shape = PHONE ? "phone 390x844 @3x, touch" : "desktop 1512x900";
console.log(`${BASE} · ${mode} · cpu ${THROTTLE}x\n`);
console.log(
  "                    median    p95    p99  worst   stutters   long tasks",
);
for (const result of results) {
  const f = result.frames;
  console.log(
    `${result.label.padEnd(16)}` +
      `${String(f.p50).padStart(8)}` +
      `${String(f.p95).padStart(7)}` +
      `${String(f.p99).padStart(7)}` +
      `${String(f.max).padStart(7)}` +
      `${String(`${f.over32}/${f.n}`).padStart(11)}` +
      `${String(`${result.long.count} (${result.long.total}ms)`).padStart(13)}`,
  );
  if (result.errors.length > 0) console.log(`  ! ${result.errors.join(" | ")}`);
}
