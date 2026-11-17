import { expect, type Page, test } from "playwright/test";
import {
  expectNoAxeViolations,
  expectNoHorizontalScroll,
  expectNothingPastRightEdge,
  homeUrl,
  LOCALES,
  type Locale,
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
        "lock-demo",
        "gate",
        "statement",
        "features",
        "highlights",
        "compare",
        "faq",
        "closing-heading",
      ]);
      expect(sections.filter((section) => section.name === "")).toEqual([]);
    });

    for (const width of [320, 375]) {
      test(`reflows at ${width}px with every visible element inside the viewport`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 800 });
        await page.goto(homeUrl(locale));
        await expectNoHorizontalScroll(page);
        await expectNothingPastRightEdge(page);
      });
    }
  });
}

test.describe("forced colors", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  const PRIMARY = ".vk-btn-primary";

  async function primarySizes(page: Page) {
    return page.locator(PRIMARY).evaluateAll((buttons) =>
      buttons.map((button) => {
        const box = button.getBoundingClientRect();
        return [box.width, box.height] as const;
      }),
    );
  }

  test("paints the hero title in solid text instead of the gradient", async ({ page }) => {
    await page.goto("/");
    await page.emulateMedia({ forcedColors: "active" });
    const title = page.locator("section.vk-banner h1 .vk-banner-title-lit");
    await expect(title).toHaveCSS("background-image", "none");
    await expect(title).not.toHaveCSS("-webkit-text-fill-color", "rgba(0, 0, 0, 0)");
  });

  test("keeps a boundary on every primary button without changing its size", async ({ page }) => {
    await page.goto("/");
    const buttons = page.locator(PRIMARY);
    expect(await buttons.count()).toBeGreaterThanOrEqual(1);
    await expect(buttons.first()).toHaveCSS("outline-style", "none");
    await expect(buttons.first()).toHaveCSS("border-top-width", "0px");
    const normal = await primarySizes(page);
    await page.emulateMedia({ forcedColors: "active" });
    for (let index = 0; index < (await buttons.count()); index += 1) {
      await expect(buttons.nth(index)).toHaveCSS("outline-style", "solid");
      await expect(buttons.nth(index)).toHaveCSS("outline-width", "1px");
      await expect(buttons.nth(index)).not.toHaveCSS("outline-style", "none");
      const paint = await buttons.nth(index).evaluate((node) => {
        const style = getComputedStyle(node);
        return { outline: style.outlineColor, text: style.color, fill: style.backgroundColor };
      });
      expect(paint.outline).not.toBe("rgba(0, 0, 0, 0)");
      expect(paint.text).not.toBe(paint.fill);
    }
    expect(await primarySizes(page)).toEqual(normal);
  });
});

test.describe("landing search", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const locale of LOCALES) {
    test(`opens the search dialog from the header trigger on ${homeUrl(locale)}`, async ({
      page,
    }) => {
      await page.goto(homeUrl(locale));
      await page.locator(".vk-header-search").click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
    });

    test(`opens the search dialog from the keyboard on ${homeUrl(locale)}`, async ({ page }) => {
      await page.goto(homeUrl(locale));
      await expect(page.locator(".vk-header-search")).toBeVisible();
      await page.keyboard.press("ControlOrMeta+k");
      await expect(page.getByRole("dialog")).toBeVisible();
    });
  }
});

test.describe("landing length on a phone", () => {
  const PHONE = { width: 391, height: 844 };

  const PHONE_SCREENS: Record<Locale, number> = {
    en: 13.5,
    de: 14.1,
    es: 14,
    fr: 14,
    ja: 14,
    "pt-BR": 14,
    "zh-CN": 14,
  };

  for (const locale of LOCALES) {
    for (const motion of ["no-preference", "reduce"] as const) {
      test(`stays under ${PHONE_SCREENS[locale]} screens in ${locale} with motion ${motion}`, async ({
        page,
      }) => {
        await page.setViewportSize(PHONE);
        await page.emulateMedia({ reducedMotion: motion });
        await page.goto(homeUrl(locale), { waitUntil: "networkidle" });
        await page.evaluate(() => document.fonts.ready);
        await expect(page.locator(".vk-scroll-top-sentinel")).toBeAttached();
        const height = await page.evaluate(() => document.documentElement.scrollHeight);
        expect(height / PHONE.height).toBeLessThan(PHONE_SCREENS[locale]);
      });
    }
  }

  test("lists the features as text cards with a docs link and no artifact card", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await page.goto(homeUrl("en"));
    await expect(page.locator("#features .vk-deck-item")).toHaveCount(6);
    await expect(page.locator("#features .vk-deck-body:visible")).toHaveCount(6);
    await expect(page.locator("#features .vk-deck-link:visible")).toHaveCount(6);
    await expect(page.locator("#features .vk-deck-card:visible")).toHaveCount(0);
    await expect(page.locator("#features .vk-deck-radio:visible")).toHaveCount(0);
    await expect(page.locator("#features .vk-deck-result:visible")).toHaveCount(0);
  });

  test("adds the result line of each command from 640px", async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 900 });
    await page.goto(homeUrl("en"));
    await expect(page.locator("#features .vk-deck-result:visible")).toHaveCount(5);
    await expect(page.locator("#features .vk-deck-card:visible")).toHaveCount(0);
  });
});
