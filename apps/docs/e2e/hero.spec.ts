import { expect, test } from "playwright/test";
import { RELEASE_BADGE } from "../lib/release-badge";
import { homeUrl, LOCALES } from "./support";

const HERO = "section.vk-banner";

for (const locale of LOCALES) {
  test.describe(`hero ${homeUrl(locale)}`, () => {
    test("shows the facts block with every fact", async ({ page }) => {
      await page.goto(homeUrl(locale));
      const facts = page.locator(`${HERO} dl.vk-facts`);
      await expect(facts).toBeVisible();
      await expect(facts.locator("dt")).toHaveCount(7);
      for (const id of RELEASE_BADGE.providers) {
        await expect(facts.locator(`[data-provider="${id}"] .vk-pill`)).toBeVisible();
      }
    });
  });
}

test.describe("hero without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("paints the h1 and the filled diff from the server HTML", async ({ page }) => {
    await page.goto("/");
    const title = page.locator(`${HERO} h1`);
    await expect(title).toBeVisible();
    await expect(title).toHaveCSS("opacity", "1");
    await expect(page.locator("[data-diff-state]")).toHaveAttribute("data-diff-state", "filled");
    await expect(page.locator(".vk-hero-diff-value").first()).toHaveCSS("opacity", "1");
  });
});

test.describe("hero diff motion", () => {
  test.use({ reducedMotion: "no-preference", viewport: { width: 375, height: 667 } });

  test("marks the keys missing below the fold and fills them once the diff scrolls in", async ({
    page,
  }) => {
    await page.goto("/");
    const diff = page.locator("[data-diff-state]");
    await expect(diff).toHaveAttribute("data-diff-state", "missing");
    await diff.scrollIntoViewIfNeeded();
    await expect(diff).toHaveAttribute("data-diff-state", "filled");
  });

  test("shows a missing value while focus is inside the diff", async ({ page }) => {
    await page.goto("/");
    const diff = page.locator("[data-diff-state]");
    await expect(diff).toHaveAttribute("data-diff-state", "missing");
    await diff
      .locator("[role='group']")
      .last()
      .evaluate((block) => (block as HTMLElement).focus({ preventScroll: true }));
    await expect(diff).toHaveAttribute("data-diff-state", "missing");
    await expect(diff.locator(".vk-hero-diff-value").first()).toHaveCSS("opacity", "1");
  });
});

for (const viewport of [
  { width: 320, height: 256 },
  { width: 568, height: 320 },
]) {
  test.describe(`hero diff motion at ${viewport.width}x${viewport.height}`, () => {
    test.use({ reducedMotion: "no-preference", viewport });

    test("fills the German values once the diff scrolls into a short viewport", async ({
      page,
    }) => {
      await page.goto("/");
      const diff = page.locator("[data-diff-state]");
      await expect(diff).toHaveAttribute("data-diff-state", "missing");
      await diff.locator(".vk-hero-diff-pane").last().scrollIntoViewIfNeeded();
      await expect(diff).toHaveAttribute("data-diff-state", "filled", { timeout: 1500 });
      const values = diff.locator(".vk-hero-diff-value");
      await expect(values).toHaveCount(2);
      for (const value of await values.all()) {
        await expect(value).toHaveCSS("opacity", "1");
      }
    });
  });
}
