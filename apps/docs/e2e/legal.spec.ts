import { expect, test } from "playwright/test";
import {
  expectNoAxeViolations,
  expectNoHorizontalScroll,
  LEGAL_PAGES,
  LOCALES,
  openInTheme,
  pageUrl,
  THEMES,
} from "./support";

for (const locale of LOCALES) {
  for (const path of LEGAL_PAGES) {
    const url = pageUrl(locale, path);

    test.describe(`legal ${url}`, () => {
      test("sets html lang to the locale", async ({ page }) => {
        await page.goto(url);
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
      });

      for (const theme of THEMES) {
        test(`has no axe violations in the ${theme} theme`, async ({ page }) => {
          await openInTheme(page, url, theme);
          await expectNoAxeViolations(page);
        });
      }

      if (path === "/contact") {
        test("enables the submit button without a colour transition in the dark theme", async ({
          page,
        }) => {
          await openInTheme(page, url, "dark");
          const submit = page.locator('form button[type="submit"]');
          await expect(submit).toBeEnabled();
          await expect(submit).toHaveCSS("transition-property", "none");
          await expectNoAxeViolations(page, "form");
        });
      }

      test("reflows at 320px without horizontal scroll", async ({ page }) => {
        await page.setViewportSize({ width: 320, height: 800 });
        await page.goto(url);
        await expectNoHorizontalScroll(page);
      });
    });
  }
}
