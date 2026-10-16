import { expect, test } from "playwright/test";
import {
  expectNoAxeViolations,
  expectNoHorizontalScroll,
  homeUrl,
  LOCALES,
  openInTheme,
  THEMES,
} from "./support";

const COMPARE = "section#compare";
const REGION = `${COMPARE} [data-compare-scroll]`;

for (const locale of LOCALES) {
  test.describe(`comparison ${homeUrl(locale)}`, () => {
    for (const theme of THEMES) {
      test(`has no axe violations in the ${theme} theme`, async ({ page }) => {
        await openInTheme(page, homeUrl(locale), theme);
        await page.locator(COMPARE).scrollIntoViewIfNeeded();
        await expectNoAxeViolations(page, COMPARE);
      });
    }

    test("links the full comparison in the same locale", async ({ page }) => {
      await page.goto(homeUrl(locale));
      const href = await page.locator(`${COMPARE} a[href$="/compare"]`).getAttribute("href");
      expect(href).toBe(locale === "en" ? "/compare" : `/${locale}/compare`);
    });
  });
}

test.describe("comparison table on a phone", () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test("scrolls inside its focused region with the arrow keys while the first column stays put", async ({
    page,
  }) => {
    await page.goto("/");
    const region = page.locator(REGION);
    await region.focus();
    await expect(region).toBeFocused();
    const firstColumn = page.locator(`${COMPARE} tbody tr:first-child th`);
    const before = await firstColumn.boundingBox();
    for (let press = 0; press < 8; press += 1) await page.keyboard.press("ArrowRight");
    await expect.poll(() => region.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
    const after = await firstColumn.boundingBox();
    expect(Math.abs((after?.x ?? 0) - (before?.x ?? 0))).toBeLessThan(1);
    await expectNoHorizontalScroll(page);
  });

  test("reflows at 320px with the table scrolling inside its region", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/");
    await expectNoHorizontalScroll(page);
    const overflow = await page
      .locator(REGION)
      .evaluate((node) => node.scrollWidth - node.clientWidth);
    expect(overflow).toBeGreaterThan(0);
  });
});

test.describe("comparison footnotes", () => {
  test("lands on the cited source when a footnote link is followed by keyboard", async ({
    page,
  }) => {
    await page.goto("/");
    const ref = page.locator(
      `${COMPARE} tr[data-row="ownKeys"] td[data-column="lingo"] [data-footnotes] a`,
    );
    await ref.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#compare-source-17$/);
    await expect(page.locator("#compare-source-17")).toBeInViewport();
  });
});
