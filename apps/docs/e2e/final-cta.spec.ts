import { expect, test } from "playwright/test";
import {
  expectNoAxeViolations,
  expectNoHorizontalScroll,
  homeUrl,
  LOCALES,
  openInTheme,
  THEMES,
} from "./support";

const CLOSER = "section[aria-labelledby='closing-heading']";

for (const locale of LOCALES) {
  test.describe(`final call to action ${homeUrl(locale)}`, () => {
    for (const theme of THEMES) {
      test(`has no axe violations in the ${theme} theme`, async ({ page }) => {
        await openInTheme(page, homeUrl(locale), theme);
        await page.locator(CLOSER).scrollIntoViewIfNeeded();
        await expectNoAxeViolations(page, CLOSER);
      });
    }

    test("stretches both actions to the command's width at 320px", async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 800 });
      await page.goto(homeUrl(locale));
      const install = await page.locator(`${CLOSER} .vk-final-install`).boundingBox();
      const actions = await page
        .locator(`${CLOSER} .vk-closer-actions a`)
        .evaluateAll((links) => links.map((link) => link.getBoundingClientRect().width));
      expect(actions).toHaveLength(2);
      for (const width of actions)
        expect(Math.abs(width - (install?.width ?? 0))).toBeLessThanOrEqual(1);
    });

    test("reflows at 320px with the command and both actions inside the column", async ({
      page,
    }) => {
      await page.setViewportSize({ width: 320, height: 800 });
      await page.goto(homeUrl(locale));
      await expectNoHorizontalScroll(page);
      const rights = await page
        .locator(`${CLOSER} :is(h2, p, a, .vk-final-install)`)
        .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().right));
      for (const right of rights) expect(right).toBeLessThanOrEqual(320);
    });
  });
}

test.describe("final call to action layout", () => {
  for (const width of [375, 1440]) {
    test(`centers the heading, lead, command and actions on the column at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      const section = await page.locator(CLOSER).boundingBox();
      if (!section) throw new Error("no closing section");
      const middle = section.x + section.width / 2;
      for (const selector of ["h2", "p.vk-lead", ".vk-final-install", ".vk-closer-actions"]) {
        const box = await page.locator(`${CLOSER} ${selector}`).boundingBox();
        expect(Math.abs((box?.x ?? 0) + (box?.width ?? 0) / 2 - middle), selector).toBeLessThan(2);
      }
      const heights = await page
        .locator(`${CLOSER} .vk-closer-actions a`)
        .evaluateAll((links) => links.map((link) => link.getBoundingClientRect().height));
      expect(heights).toHaveLength(2);
      for (const height of heights) expect(height).toBeGreaterThanOrEqual(44);
    });
  }

  test("is the only centered section heading on the landing", async ({ page }) => {
    await page.goto("/");
    const centered = await page
      .locator("main section h2")
      .evaluateAll((headings) =>
        headings
          .filter((heading) => getComputedStyle(heading).textAlign === "center")
          .map((heading) => heading.id),
      );
    expect(centered).toEqual(["closing-heading"]);
  });

  test("draws no gradient, glow or card behind the closer", async ({ page }) => {
    await page.goto("/");
    const styles = await page.locator(CLOSER).evaluate((section) => {
      const nodes = [section, ...Array.from(section.querySelectorAll(":scope > div"))];
      return nodes.map((node) => {
        const style = getComputedStyle(node);
        return `${style.backgroundImage} ${style.boxShadow} ${style.borderTopWidth}`;
      });
    });
    for (const style of styles) expect(style).toBe("none none 0px");
  });

  test("opens the section-closer space under the contribution band", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const gap = await page.evaluate(() => {
      const band = document.querySelector("section#open-source");
      const heading = document.querySelector("#closing-heading");
      const closer = getComputedStyle(document.documentElement).getPropertyValue("--section-lg");
      if (!band || !heading) return null;
      return {
        space: heading.getBoundingClientRect().top - band.getBoundingClientRect().bottom,
        closer: Number.parseFloat(closer),
      };
    });
    expect(gap?.space ?? 0).toBeGreaterThanOrEqual((gap?.closer ?? 1) - 1);
  });
});
