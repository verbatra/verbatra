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

    test("names every landing section by its heading or label", async ({ page }) => {
      await page.goto(homeUrl(locale));
      const sections = await page.locator(".vk-home > section").evaluateAll((nodes) =>
        nodes.map((node) => {
          const ids = node.getAttribute("aria-labelledby")?.split(/\s+/) ?? [];
          const labelled = ids
            .map((id) => node.ownerDocument.getElementById(id))
            .filter((label) => label !== null && node.contains(label))
            .map((label) => label?.textContent?.trim() ?? "")
            .join(" ");
          return {
            id: node.id || node.getAttribute("aria-labelledby") || "",
            name: labelled || node.getAttribute("aria-label") || "",
          };
        }),
      );
      expect(sections.map((section) => section.id)).toEqual([
        "hero-title",
        "marquee",
        "playground",
        "flow",
        "features",
        "compare",
        "faq",
        "open-source",
        "closing-heading",
      ]);
      expect(sections.filter((section) => section.name === "")).toEqual([]);
    });

    test("reflows at 320px without horizontal scroll", async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 800 });
      await page.goto(homeUrl(locale));
      await expectNoHorizontalScroll(page);
    });
  });
}

test.describe("code frames", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("draw the focus ring of every focusable code block inside its frame", async ({ page }) => {
    await page.goto("/");
    const blocks = page.locator('.vk-code-frame-body pre[tabindex="0"]');
    const count = await blocks.count();
    expect(count).toBeGreaterThan(0);
    for (let index = 0; index < count; index += 1) {
      const block = blocks.nth(index);
      if (!(await block.isVisible())) continue;
      await block.focus();
      expect(await block.evaluate((node) => node.matches(":focus-visible"))).toBe(true);
      await expect(block, `code block ${index}`).toHaveCSS("outline-offset", "-2px");
      await expect(block).toHaveCSS("outline-style", "solid");
    }
  });
});
