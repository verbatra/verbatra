import { expect, test } from "playwright/test";
import { SITE_URL } from "@/lib/site-url";
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
    test(`sits on the page under one hairline in the ${theme} theme`, async ({ page }) => {
      await openInTheme(page, "/", theme);
      const style = await page.locator(FOOTER).evaluate((footer) => {
        const computed = getComputedStyle(footer);
        const probe = document.createElement("div");
        probe.style.background = "var(--surface-page)";
        document.body.append(probe);
        const surface = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return {
          image: computed.backgroundImage,
          color: computed.backgroundColor,
          surface,
          border: computed.borderTopWidth,
          decorations: footer.querySelectorAll(":scope > [aria-hidden='true']").length,
        };
      });
      expect(style.image).toBe("none");
      expect(style.color).toBe(style.surface);
      expect(style.border).toBe("1px");
      expect(style.decorations).toBe(0);
    });
  }

  test("closes the comparison page too", async ({ page }) => {
    await page.goto("/compare");
    await expect(page.locator(FOOTER)).toHaveCount(1);
  });
});

const PEOPLE = `${FOOTER} .vk-contribute-people`;

test.describe("footer contributors", () => {
  for (const theme of THEMES) {
    test(`has no axe violations in the ${theme} theme`, async ({ page }) => {
      await openInTheme(page, "/", theme);
      await page.locator(PEOPLE).scrollIntoViewIfNeeded();
      await expectNoAxeViolations(page, PEOPLE);
    });
  }

  for (const width of [375, 1440]) {
    test(`gives every contributor link a 44px target at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      const heights = await page
        .locator(`${PEOPLE} a`)
        .evaluateAll((links) => links.map((link) => link.getBoundingClientRect().height));
      expect(heights.length).toBeGreaterThan(0);
      for (const height of heights) expect(height).toBeGreaterThanOrEqual(44);
    });
  }

  test("loads every contributor avatar from this site", async ({ page }) => {
    const origins = new Set<string>();
    page.on("request", (request) => origins.add(new URL(request.url()).origin));
    await page.goto("/");
    const images = page.locator(`${PEOPLE} img`);
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

const SWITCH_PAGES = [
  "/",
  "/de",
  "/compare",
  "/fr/compare",
  "/es/imprint",
  "/privacy",
  "/de/contact",
  "/fr/licenses",
  "/de/docs/providers",
] as const;

test.describe("footer locale switch", () => {
  for (const path of SWITCH_PAGES) {
    test(`links ${path} in every locale, matching its hreflang alternates, without script`, async ({
      browser,
    }) => {
      const context = await browser.newContext({ javaScriptEnabled: false });
      const page = await context.newPage();
      await page.goto(path);
      const lang = await page.locator("html").getAttribute("lang");
      const links = page.locator("footer .vk-locale-links a");
      await expect(links).toHaveCount(LOCALES.length);
      const found = await links.evaluateAll((anchors) =>
        anchors.map((anchor) => ({
          href: anchor.getAttribute("href") ?? "",
          hreflang: anchor.getAttribute("hreflang"),
          lang: anchor.getAttribute("lang"),
          current: anchor.getAttribute("aria-current"),
        })),
      );
      expect(found.map((link) => link.hreflang)).toEqual([...LOCALES]);
      expect(found.map((link) => link.lang)).toEqual([...LOCALES]);
      expect(found.filter((link) => link.current === "page").map((link) => link.hreflang)).toEqual([
        lang,
      ]);
      for (const link of found) {
        const alternate = await page
          .locator(`link[rel="alternate"][hreflang="${link.hreflang}"]`)
          .getAttribute("href");
        expect(new URL(alternate ?? "", SITE_URL).pathname, link.href).toBe(link.href);
        const response = await page.request.get(link.href, { maxRedirects: 0 });
        expect(response.status(), link.href).toBe(200);
      }
      await context.close();
    });
  }

  test("is named and passes axe on the landing and a legal page", async ({ page }) => {
    for (const path of ["/de", "/es/privacy"]) {
      await page.goto(path);
      await expect(page.locator("footer nav.vk-locale-links")).toHaveAccessibleName(
        /Sprache|Idioma/,
      );
      await expectNoAxeViolations(page, "footer");
    }
  });
});

test.describe("missing docs page without script", () => {
  test.use({ javaScriptEnabled: false });

  for (const path of ["/docs/no-such-page", "/de/docs/no-such-page", "/fr/docs/cli/no-such-page"]) {
    test(`answers ${path} with a 404 whose footer links no missing page`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
      const footer = page.locator("footer");
      await expect(footer).toBeVisible();
      const hrefs = await footer
        .locator("a")
        .evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute("href") ?? ""));
      expect(hrefs.length).toBeGreaterThan(0);
      expect(hrefs.filter((href) => href.includes("no-such-page"))).toEqual([]);
      await expect(page.locator(".vk-locale-links")).toHaveCount(0);
      for (const href of hrefs.filter((href) => href.startsWith("/"))) {
        const linked = await page.request.get(href, { maxRedirects: 0 });
        expect(linked.status(), href).toBe(200);
      }
    });
  }
});

test.describe("footer grid", () => {
  for (const width of [768, 1024, 1279]) {
    test(`starts each secondary group on a product column at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      const starts = (selector: string) =>
        page
          .locator(selector)
          .evaluateAll((nodes) => [
            ...new Set(nodes.map((node) => Math.round(node.getBoundingClientRect().left))),
          ]);
      const product = await starts('.vk-footer-group[data-group="product"] li');
      const secondary = await starts(".vk-footer-secondary > .vk-footer-group");
      expect(product).toHaveLength(3);
      expect(secondary).toHaveLength(3);
      for (const [index, start] of secondary.entries()) {
        expect(Math.abs(start - (product[index] ?? 0)), `group ${index}`).toBeLessThanOrEqual(1);
      }
    });
  }
});
