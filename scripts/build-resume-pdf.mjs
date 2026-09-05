/**
 * The résumé PDF, printed from the résumé page.
 *
 * The Download PDF button on /resume points at a static file. Rather than keep
 * a separately authored document that drifts from the page every time a date
 * or a bullet changes, this prints the page itself — so the file and the page
 * are the same résumé by construction.
 *
 * The page is already built for paper: `@media print` in globals.css inverts it
 * to black on white, drops the toolbar via [data-print="hide"], and spells out
 * external links after their text. Chromium's print path picks all of that up,
 * which is why this emits `screen` media rather than forcing anything.
 *
 *   npx next start --port 3100
 *   node scripts/build-resume-pdf.mjs http://localhost:3100/resume
 */
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { statSync } from "node:fs";

const url = process.argv[2] ?? "http://localhost:3100/resume";
const out = "public/aditya-aryan-resume.pdf";

const browser = await chromium.launch();
const page = await browser.newPage();

const response = await page.goto(url, { waitUntil: "networkidle" });
if (!response?.ok()) {
  console.error(`${url} returned ${response?.status()}. Is the server running?`);
  process.exit(1);
}

// Fonts are self-hosted and subset; printing before they land silently swaps in
// a fallback face and the measure changes.
await page.evaluate(() => document.fonts.ready);

await mkdir("public", { recursive: true });
await page.pdf({
  path: out,
  format: "A4",
  // The page sets its own 210mm measure and print padding, so the only margin
  // needed here is the physical one a printer cannot reach into.
  margin: { top: "12mm", bottom: "12mm", left: "12mm", right: "12mm" },
  printBackground: true,
  preferCSSPageSize: false,
});

await browser.close();
console.log(`${out}  ${(statSync(out).size / 1024).toFixed(0)} KB`);
