import { expect, test } from "playwright/test";
import {
  expectBackwardWalkClearsHeader,
  expectEdgeRefsReachable,
  expectNoAxeViolations,
  expectNoHorizontalScroll,
  expectStickyLabelsFit,
  homeUrl,
  LOCALES,
  openInTheme,
  pageUrl,
  THEMES,
  waitForCompareFocus,
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

    test("links the full comparison in the same locale, and the link lands on it", async ({
      page,
    }) => {
      await page.goto(homeUrl(locale));
      const link = page.locator(`${COMPARE} a[href$="/compare"]`);
      const target = pageUrl(locale, "/compare");
      expect(await link.getAttribute("href")).toBe(target);
      await link.click();
      await expect(page).toHaveURL(new RegExp(`${target}$`));
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator("main [data-compare-scroll]")).toBeVisible();
    });
  });
}

for (const width of [320, 375]) {
  for (const locale of LOCALES) {
    test(`keeps every criterion inside its pinned column at ${width}px in ${locale}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(homeUrl(locale));
      await expectStickyLabelsFit(page, COMPARE);
    });
  }
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
  test("follows a footnote from the landing to its source on /compare and marks it", async ({
    page,
  }) => {
    await page.goto("/");
    const ref = page.locator(
      `${COMPARE} tr[data-row="ownKeys"] td[data-column="lingo"] [data-footnotes] a`,
    );
    await ref.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/compare#source-17$/);
    const source = page.locator("#source-17");
    await expect(source).toBeInViewport();
    await expect(source).toHaveCSS("box-shadow", /inset/);
    const header = await page.locator("header").first().boundingBox();
    const box = await source.boundingBox();
    expect(box?.y ?? 0).toBeGreaterThanOrEqual((header?.y ?? 0) + (header?.height ?? 0));
  });

  test("keeps a focused footnote clear of the pinned first column on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/");
    await waitForCompareFocus(page);
    const region = page.locator(REGION);
    const ref = page.locator(
      `${COMPARE} tr[data-row="ownKeys"] td[data-column="hostedTms"] [data-footnotes] a`,
    );
    await ref.last().focus();
    const sticky = await page.locator(`${COMPARE} tbody tr:first-child th`).boundingBox();
    const box = await ref.last().boundingBox();
    expect(box?.x ?? 0).toBeGreaterThanOrEqual((sticky?.x ?? 0) + (sticky?.width ?? 0) - 1);
    expect(sticky?.width ?? 0).toBeLessThanOrEqual(7.5 * 16 + 1);
    await expect.poll(() => region.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
  });
});

for (const width of [375, 1024]) {
  test(`tabs to the last footnote of every row fully into view at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");
    await expectEdgeRefsReachable(page, COMPARE);
  });
}

for (const width of [375, 1024]) {
  test(`keeps every footnote clear of the header on a backwards walk at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");
    await expectBackwardWalkClearsHeader(page, COMPARE);
  });
}
