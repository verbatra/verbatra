import { expect, test } from "playwright/test";
import { HERO_TRANSLATE_LOCALE_LINES } from "@/lib/hero-terminal";

const TILE_SCROLLER = "#highlights .vk-bento > article:first-child [role='group']";

for (const width of [320, 375, 391, 768, 1024]) {
  test.describe(`translate tile at ${width}px`, () => {
    test.use({ viewport: { width, height: 844 } });

    test("shows every output line whole, with nothing to scroll and no fade over it", async ({
      page,
    }) => {
      await page.goto("/");
      const scroller = page.locator(TILE_SCROLLER);
      await scroller.scrollIntoViewIfNeeded();
      const geometry = await scroller.evaluate((element) => ({
        client: element.clientWidth,
        scroll: element.scrollWidth,
        text: element.textContent ?? "",
      }));
      expect(geometry.scroll).toBeLessThanOrEqual(geometry.client);
      for (const line of HERO_TRANSLATE_LOCALE_LINES) {
        expect(geometry.text.replace(/\s+/g, " ")).toContain(line.replace(/\s+/g, " "));
      }
    });

    test("keeps the right edge of every line inside the box", async ({ page }) => {
      await page.goto("/");
      const scroller = page.locator(TILE_SCROLLER);
      await scroller.scrollIntoViewIfNeeded();
      const farthest = await scroller.evaluate((element) => {
        const range = document.createRange();
        range.selectNodeContents(element.querySelector("code") as Element);
        const box = element.getBoundingClientRect();
        const right = Math.max(...Array.from(range.getClientRects(), (rect) => rect.right));
        return right - box.right;
      });
      expect(farthest).toBeLessThanOrEqual(0);
    });
  });
}

test.describe("translate tile at 1440px", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("is not a tab stop, since it never scrolls", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(TILE_SCROLLER)).not.toHaveAttribute("tabindex", /.*/);
  });

  test("prints each locale line on one row", async ({ page }) => {
    await page.goto("/");
    const rows = await page
      .locator(TILE_SCROLLER)
      .evaluate((element) => element.querySelector("code")?.getClientRects().length ?? 0);
    expect(rows).toBeGreaterThan(0);
    const scrolls = await page
      .locator(TILE_SCROLLER)
      .evaluate((element) => element.scrollWidth > element.clientWidth);
    expect(scrolls).toBe(false);
  });
});
