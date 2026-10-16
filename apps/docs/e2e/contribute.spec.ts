import { expect, test } from "playwright/test";
import {
  expectNoAxeViolations,
  expectNoHorizontalScroll,
  homeUrl,
  LOCALES,
  openInTheme,
  THEMES,
} from "./support";

const SECTION = "section#open-source";
const STEPS = `${SECTION} ol.vk-contribute-steps > li`;

for (const locale of LOCALES) {
  test.describe(`contribution ${homeUrl(locale)}`, () => {
    for (const theme of THEMES) {
      test(`has no axe violations in the ${theme} theme`, async ({ page }) => {
        await openInTheme(page, homeUrl(locale), theme);
        await page.locator(SECTION).scrollIntoViewIfNeeded();
        await expectNoAxeViolations(page, SECTION);
      });
    }

    for (const width of [1024, 1440]) {
      test(`lines the step titles, bodies and commands up across the row at ${width}px`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(homeUrl(locale));
        for (const part of ["h3", "p", "code"]) {
          const tops = await page
            .locator(`${STEPS} > ${part}`)
            .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().top));
          expect(tops, part).toHaveLength(3);
          expect(Math.max(...tops) - Math.min(...tops), part).toBeLessThanOrEqual(1);
        }
      });
    }

    test("reflows at 320px with every step and link inside the column", async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 800 });
      await page.goto(homeUrl(locale));
      await expectNoHorizontalScroll(page);
      const section = await page.locator(SECTION).boundingBox();
      const widths = await page
        .locator(`${SECTION} :is(li, a, code, h3, p)`)
        .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().right));
      for (const right of widths) expect(right).toBeLessThanOrEqual((section?.width ?? 0) + 0.5);
    });
  });
}

test.describe("contribution layout", () => {
  test("follows the FAQ and precedes the closing section", async ({ page }) => {
    await page.goto("/");
    const order = await page
      .locator("main section[aria-labelledby]")
      .evaluateAll((sections) =>
        sections
          .filter((section) => section.parentElement?.closest("section") === null)
          .map((section) => section.id || section.getAttribute("aria-labelledby")),
      );
    const faq = order.indexOf("faq");
    expect(faq).toBeGreaterThan(-1);
    expect(order.slice(faq, faq + 3)).toEqual(["faq", "open-source", "closing-heading"]);
  });

  test("sits on the band surface while the FAQ before it sits on the page", async ({ page }) => {
    await page.goto("/");
    const backgrounds = await page.evaluate(() => {
      const color = (selector: string) => {
        const node = document.querySelector(selector);
        return node ? getComputedStyle(node).backgroundColor : "";
      };
      return { faq: color("section#faq"), contribute: color("section#open-source") };
    });
    expect(backgrounds.contribute).not.toBe("rgba(0, 0, 0, 0)");
    expect(backgrounds.contribute).not.toBe(backgrounds.faq);
  });

  test("sets the steps in one row at 1440px and in one column at 375px", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const wide = await page
      .locator(STEPS)
      .evaluateAll((steps) => steps.map((step) => step.getBoundingClientRect().top));
    expect(wide).toHaveLength(3);
    expect(new Set(wide.map(Math.round)).size).toBe(1);
    await page.setViewportSize({ width: 375, height: 800 });
    const narrow = await page
      .locator(STEPS)
      .evaluateAll((steps) => steps.map((step) => step.getBoundingClientRect().left));
    expect(new Set(narrow.map(Math.round)).size).toBe(1);
  });

  for (const width of [375, 1440]) {
    test(`opens the steps one head gap under the lead at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      const gap = await page.evaluate(() => {
        const lead = document.querySelector("section#open-source .vk-section-head-lead");
        const steps = document.querySelector("section#open-source .vk-contribute-steps");
        if (!lead || !steps) return -1;
        const expected = Number.parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue("--head-gap"),
        );
        const actual = steps.getBoundingClientRect().top - lead.getBoundingClientRect().bottom;
        return actual - expected * 16;
      });
      expect(Math.abs(gap)).toBeLessThanOrEqual(1);
    });
  }

  for (const width of [375, 1440]) {
    test(`gives every link a 44px target at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      const heights = await page
        .locator(`${SECTION} a`)
        .evaluateAll((links) => links.map((link) => link.getBoundingClientRect().height));
      expect(heights.length).toBeGreaterThan(0);
      for (const height of heights) expect(height).toBeGreaterThanOrEqual(44);
    });
  }

  test("loads every contributor avatar from this site", async ({ page }) => {
    const origins = new Set<string>();
    page.on("request", (request) => origins.add(new URL(request.url()).origin));
    await page.goto("/");
    const images = page.locator(`${SECTION} img`);
    await images.first().scrollIntoViewIfNeeded();
    await expect(images.first()).toHaveJSProperty("complete", true);
    const natural = await images
      .first()
      .evaluate((image) => (image as HTMLImageElement).naturalWidth);
    expect(natural).toBeGreaterThan(0);
    const self = new URL(page.url()).origin;
    expect([...origins]).toEqual([self]);
  });
});
