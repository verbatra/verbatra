import { expect, test } from "playwright/test";
import {
  expectNoAxeViolations,
  expectNoHorizontalScroll,
  homeUrl,
  LOCALES,
  openInTheme,
  THEMES,
} from "./support";

for (const locale of LOCALES) {
  test.describe(`landing ${homeUrl(locale)}`, () => {
    test("sets html lang to the locale", async ({ page }) => {
      await page.goto(homeUrl(locale));
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
    });

    for (const theme of THEMES) {
      test(`has no axe violations in the ${theme} theme`, async ({ page }) => {
        await openInTheme(page, homeUrl(locale), theme);
        await expectNoAxeViolations(page);
      });
    }

    test("reflows at 320px without horizontal scroll", async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 800 });
      await page.goto(homeUrl(locale));
      await expectNoHorizontalScroll(page);
    });
  });
}
