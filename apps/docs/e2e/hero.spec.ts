import { expect, test } from "playwright/test";
import { expectNoAxeViolations, homeUrl, LOCALES, openInTheme, THEMES } from "./support";

const HERO = "section.vk-banner";

for (const locale of LOCALES) {
  test.describe(`hero ${homeUrl(locale)}`, () => {
    for (const theme of THEMES) {
      test(`has no axe violations in the ${theme} theme`, async ({ page }) => {
        await openInTheme(page, homeUrl(locale), theme);
        await expectNoAxeViolations(page, HERO);
      });
    }

    test("shows the facts block with every fact", async ({ page }) => {
      await page.goto(homeUrl(locale));
      const facts = page.locator(`${HERO} dl.vk-facts`);
      await expect(facts).toBeVisible();
      await expect(facts.locator("dt")).toHaveCount(7);
      await expect(facts.locator('[data-provider="libretranslate"] .vk-pill')).toBeVisible();
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
});
