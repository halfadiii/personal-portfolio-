import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/** §8 — every route, zero violations, as the merge gate. */
const ROUTES = [
  "/",
  "/about",
  "/resume",
  "/work/nyc-subway-reliability",
  "/work/print-inspection-cv",
  "/dashboard/bank-marketing",
  "/demo/subway",
  "/demo/print-inspection",
  "/this-route-does-not-exist",
];

for (const route of ROUTES) {
  test(`axe: ${route}`, async ({ page }) => {
    // The home page is long and carries a WebGL scene; axe needs the room.
    test.setTimeout(90_000);
    await page.goto(route);
    // Let the preloader hand over before auditing what is on screen.
    await page.waitForFunction(
      () => document.documentElement.dataset.preloader !== "on",
      undefined,
      { timeout: 10_000 },
    );

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(
      results.violations,
      results.violations
        .map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(" | ")}`)
        .join("\n"),
    ).toEqual([]);
  });
}
