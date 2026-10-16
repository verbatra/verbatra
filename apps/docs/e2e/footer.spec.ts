import { expect, test } from "playwright/test";
import {
  expectNoAxeViolations,
  expectNoHorizontalScroll,
  homeUrl,
  LOCALES,
  openInTheme,
  pageUrl,
  THEMES,
} from "./support";

const FOOTER = "footer.vk-footer";

for (const locale of LOCALES) {
  test.describe(`footer ${homeUrl(locale)}`, () => {
    for (const theme of THEMES) {
      test(`has no axe violations in the ${theme} theme`, async ({ page }) => {
        await openInTheme(page, homeUrl(locale), theme);
        await page.locator(FOOTER).scrollIntoViewIfNeeded();
        await expectNoAxeViolations(page, FOOTER);
      });
    }

    test("reaches every same-site link in the reader's locale", async ({ page }) => {
      await page.goto(homeUrl(locale));
      const hrefs = await page
        .locator(`${FOOTER} a[href^='/']`)
        .evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
      expect(hrefs).toContain(pageUrl(locale, "/compare"));
      expect(hrefs).toContain(pageUrl(locale, "/imprint"));
      expect(hrefs).toContain(pageUrl(locale, "/privacy"));
      expect(hrefs).toContain(pageUrl(locale, "/licenses"));
      for (const href of hrefs) {
        const response = await page.request.get(href);
        expect(response.status(), href).toBe(200);
      }
    });

    test("reflows at 320px without horizontal scroll", async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 800 });
      await page.goto(homeUrl(locale));
      await expectNoHorizontalScroll(page);
      const box = await page.locator(FOOTER).boundingBox();
      expect(box?.width ?? 0).toBeLessThanOrEqual(320);
    });
  });
}

test.describe("footer surface", () => {
  for (const theme of THEMES) {
    test(`is one flat band under a hairline in the ${theme} theme`, async ({ page }) => {
      await openInTheme(page, "/", theme);
      const style = await page.locator(FOOTER).evaluate((footer) => {
        const computed = getComputedStyle(footer);
        const probe = document.createElement("div");
        probe.style.background = "var(--surface-band)";
        document.body.append(probe);
        const band = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return {
          image: computed.backgroundImage,
          color: computed.backgroundColor,
          band,
          border: computed.borderTopWidth,
          decorations: footer.querySelectorAll(":scope > [aria-hidden='true']").length,
        };
      });
      expect(style.image).toBe("none");
      expect(style.color).toBe(style.band);
      expect(style.border).toBe("1px");
      expect(style.decorations).toBe(0);
    });
  }

  test("closes the comparison page too", async ({ page }) => {
    await page.goto("/compare");
    await expect(page.locator(FOOTER)).toHaveCount(1);
  });
});
