import { expect, test } from "@playwright/test";

/** The mechanical half of the §12 acceptance checklist. */

const ROUTES = ["/", "/about", "/resume", "/work/nyc-subway-reliability"];

test.describe("no horizontal overflow at 320px", () => {
  for (const route of ROUTES) {
    test(route, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 720 });
      await page.goto(route);
      await page.waitForFunction(
        () => document.documentElement.dataset.preloader !== "on",
      );
      const overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        return doc.scrollWidth - doc.clientWidth;
      });
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
});

test("focus is always visible and never trapped on the home page", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(
    () => document.documentElement.dataset.preloader !== "on",
  );

  const seen = new Set<string>();
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate((step) => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const style = getComputedStyle(el);
      const visible =
        style.outlineStyle !== "none" ||
        style.boxShadow !== "none" ||
        el.matches(":focus-visible");
      return {
        key: `${el.tagName}:${el.textContent?.slice(0, 24) ?? ""}:${step}`,
        visible,
      };
    }, i);
    if (!info) continue;
    seen.add(info.key);
    expect(info.visible, `no visible focus on step ${i}`).toBe(true);
  }

  // Tabbing moved through many distinct elements rather than looping on one.
  expect(seen.size).toBeGreaterThan(15);
});

test("the skip link is the first stop and reaches main", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const href = await page.evaluate(() =>
    (document.activeElement as HTMLAnchorElement | null)?.getAttribute("href"),
  );
  expect(href).toBe("#main");
});

test("reduced motion: nothing animates and the preloader never runs", async ({
  browser,
}) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/");

  await expect(page.locator("#preloader")).toBeHidden();

  const animating = await page.evaluate(
    () =>
      document.getAnimations().filter((a) => a.playState === "running").length,
  );
  expect(animating).toBe(0);
  await context.close();
});

test("with JavaScript disabled the text content is present", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Aditya Aryan" }),
  ).toBeVisible();
  // Matched loosely on the count: the heading is derived from how many
  // projects there are, and the point of this test is that the copy
  // renders at all without JavaScript.
  await expect(page.getByText(/\w+ things I built\./)).toBeVisible();
  // Same reason: the role count is derived too, and pinning it here just means
  // this test fails the next time a job is added rather than catching anything.
  await expect(page.getByText(/\w+ roles, one throughline\./)).toBeVisible();
  await expect(page.locator("#preloader")).toBeHidden();
  await context.close();
});

test("the command palette opens on the keyboard and jumps to a section", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(
    () => document.documentElement.dataset.preloader !== "on",
  );

  await page.keyboard.press("ControlOrMeta+k");
  const input = page.getByPlaceholder("Jump to a section, project, or action");
  // The palette is code-split; on a cold server the chunk can take a moment.
  await expect(input).toBeVisible({ timeout: 15_000 });

  await input.fill("resume");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/resume$/);
});

test("a pipeline stage opens its panel with the code that runs it", async ({
  page,
}) => {
  // The pipeline and the regression belong to the case study they describe,
  // not to the home page.
  await page.goto("/work/nyc-subway-reliability");

  await page.getByRole("button", { name: /03 \/ arrival inference/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("int_inferred_arrivals.sql");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("the contact form reports what broke", async ({ page }) => {
  await page.goto("/#contact");
  await page.waitForFunction(
    () => document.documentElement.dataset.preloader !== "on",
  );

  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText(/Tell me what to call you\./)).toBeVisible();
});
