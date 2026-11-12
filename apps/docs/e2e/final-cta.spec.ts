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

    test("reflows at 320px with the command inside the column", async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 800 });
      await page.goto(homeUrl(locale));
      await expectNoHorizontalScroll(page);
      const rights = await page
        .locator(`${CLOSER} :is(h2, p, .vk-final-install, .vk-closer-proof)`)
        .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().right));
      for (const right of rights) expect(right).toBeLessThanOrEqual(320);
    });
  });
}

test.describe("final call to action layout", () => {
  for (const width of [375, 1440]) {
    test(`centers the heading, lead and command on the column at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      const section = await page.locator(CLOSER).boundingBox();
      if (!section) throw new Error("no closing section");
      const middle = section.x + section.width / 2;
      for (const selector of ["h2", "p.vk-lead", ".vk-final-install"]) {
        const box = await page.locator(`${CLOSER} ${selector}`).boundingBox();
        expect(Math.abs((box?.x ?? 0) + (box?.width ?? 0) / 2 - middle), selector).toBeLessThan(2);
      }
    });
  }

  test("offers init then the dry run, then exactly five proof links and no other link", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator(`${CLOSER} .vk-final-install code`)).toHaveText([
      "npx @verbatra/cli init",
      "npx @verbatra/cli translate --dry-run",
    ]);
    const links = page.locator(`${CLOSER} a`);
    await expect(links).toHaveCount(5);
    await expect(page.locator(`${CLOSER} .vk-closer-proof a`)).toHaveCount(5);
    await expect(links).toHaveText([
      /^npm provenance/,
      /^MIT license/,
      /^The CLI sends no telemetry/,
      /^90% coverage gate/,
      /^CI workflow/,
    ]);
    await expect(links.nth(2)).toHaveAttribute("href", "/docs/data-handling");
    await expect(page.locator(`${CLOSER} .vk-closer-actions`)).toHaveCount(0);
  });

  test("keeps the proof row centered, quiet and inside the panel at 320px and 1440px", async ({
    page,
  }) => {
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      const panel = await page.locator(`${CLOSER} .vk-closer`).boundingBox();
      const rows = await page
        .locator(`${CLOSER} .vk-closer-proof a`)
        .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect()));
      if (!panel) throw new Error("no closing panel");
      for (const row of rows) {
        expect(row.left, `${width}`).toBeGreaterThanOrEqual(panel.x);
        expect(row.right, `${width}`).toBeLessThanOrEqual(panel.x + panel.width);
      }
      const left = Math.min(...rows.map((row) => row.left)) - panel.x;
      const right = panel.x + panel.width - Math.max(...rows.map((row) => row.right));
      expect(Math.abs(left - right), `${width}`).toBeLessThan(width === 1440 ? 2 : 40);
      await expectNoHorizontalScroll(page);
    }
  });

  test("fetches nothing from another host while the closing panel shows", async ({ page }) => {
    const origins = new Set<string>();
    page.on("request", (request) => origins.add(new URL(request.url()).origin));
    await page.goto("/");
    await page.locator(CLOSER).scrollIntoViewIfNeeded();
    expect([...origins]).toEqual([new URL(page.url()).origin]);
  });

  test("centers only the marquee and closing section headings on the landing", async ({ page }) => {
    await page.goto("/");
    const centered = await page
      .locator("main section h2")
      .evaluateAll((headings) =>
        headings
          .filter((heading) => getComputedStyle(heading).textAlign === "center")
          .map((heading) => heading.id),
      );
    expect(centered).toEqual(["marquee-heading", "closing-heading"]);
  });

  test("draws the closer as one bordered glow panel over a decorative grid", async ({ page }) => {
    await page.goto("/");
    const panel = page.locator(`${CLOSER} .vk-closer`);
    await expect(panel).toHaveCSS("border-top-width", "1px");
    await expect(panel).toHaveCSS("border-top-left-radius", "28px");
    await expect(panel).toHaveCSS("background-image", /radial-gradient/);
    await expect(page.locator(`${CLOSER} .vk-closer-grid`)).toHaveAttribute("aria-hidden", "true");
    await expect(page.locator(`${CLOSER} p.vk-eyebrow`)).toBeVisible();
  });

  test("opens the section-closer space under the FAQ", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const gap = await page.evaluate(() => {
      const band = document.querySelector("section#faq");
      const heading = document.querySelector(".vk-final-cta .vk-closer");
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
