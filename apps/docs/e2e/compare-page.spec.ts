import { expect, test } from "playwright/test";
import {
  expectNoAxeViolations,
  expectNoHorizontalScroll,
  LOCALES,
  openInTheme,
  pageUrl,
  THEMES,
} from "./support";

const REGION = "main [data-compare-scroll]";

for (const locale of LOCALES) {
  const url = pageUrl(locale, "/compare");

  test.describe(`comparison page ${url}`, () => {
    for (const theme of THEMES) {
      test(`has no axe violations in the ${theme} theme`, async ({ page }) => {
        await openInTheme(page, url, theme);
        await expectNoAxeViolations(page);
      });
    }

    test("sets html lang, one h1 and a self-referencing canonical with every hreflang", async ({
      page,
    }) => {
      await page.goto(url);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.locator("h1")).toHaveCount(1);
      const origin = "https://verbatra.kreitz-webdev.de";
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        `${origin}${url}`,
      );
      const hreflangs = [
        ...LOCALES.map((lang) => [lang, pageUrl(lang, "/compare")] as const),
        ["x-default", "/compare"] as const,
      ];
      for (const [lang, target] of hreflangs) {
        await expect(
          page.locator(`link[rel="alternate"][hreflang="${lang}"]`),
          lang,
        ).toHaveAttribute("href", `${origin}${target}`);
      }
      await expect(page.locator('link[rel="alternate"][type="text/markdown"]')).toHaveAttribute(
        "href",
        `${origin}${url}.md`,
      );
    });

    test("serves its markdown at .md and on Accept: text/markdown", async ({ request }) => {
      const explicit = await request.get(`${url}.md`);
      expect(explicit.status()).toBe(200);
      expect(explicit.headers()["content-type"]).toContain("text/markdown");
      expect(await explicit.text()).toContain("| --- |");
      const negotiated = await request.get(url, { headers: { accept: "text/markdown" } });
      expect(negotiated.headers()["content-type"]).toContain("text/markdown");
      expect(negotiated.headers().vary).toContain("Accept");
      const html = await request.get(url, { headers: { accept: "text/html" } });
      expect(html.headers()["content-type"]).toContain("text/html");
      expect(html.headers().vary).toContain("Accept");
    });

    test("reflows at 320px with the table scrolling inside its region", async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 800 });
      await page.goto(url);
      await expectNoHorizontalScroll(page);
      const overflow = await page
        .locator(REGION)
        .evaluate((node) => node.scrollWidth - node.clientWidth);
      expect(overflow).toBeGreaterThan(0);
    });
  });
}

test.describe("full comparison table", () => {
  test("scrolls inside its focused region on a phone while the first column stays put", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/compare");
    const region = page.locator(REGION);
    await region.focus();
    await expect(region).toBeFocused();
    const firstColumn = page.locator("main tbody tr:first-child th");
    const before = await firstColumn.boundingBox();
    for (let press = 0; press < 8; press += 1) await page.keyboard.press("ArrowRight");
    await expect.poll(() => region.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
    const after = await firstColumn.boundingBox();
    expect(Math.abs((after?.x ?? 0) - (before?.x ?? 0))).toBeLessThan(1);
    await expectNoHorizontalScroll(page);
  });

  test("tells a wide screen that the table scrolls sideways", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/compare");
    await expect(page.locator("main .vk-compare-hint")).toBeVisible();
  });

  test("lands on the cited source when a footnote link is followed by keyboard", async ({
    page,
  }) => {
    await page.goto("/compare");
    const ref = page.locator(
      'main tr[data-row="selfHosting"] td[data-column="lokalise"] [data-footnotes] a',
    );
    await ref.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#source-62$/);
    await expect(page.locator("#source-62")).toBeInViewport();
    await expect(page.locator("#source-62")).toHaveCSS("box-shadow", /inset/);
  });

  test("sets the sources in two columns on a wide screen", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/compare");
    await expect(page.locator("main ol[aria-labelledby]")).toHaveCSS("column-count", "2");
  });
});
