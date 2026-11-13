import { expect, test } from "playwright/test";
import {
  brokenWordPiecesIn,
  expectEveryCompareCellVisible,
  expectNoAxeViolations,
  expectNoHorizontalScroll,
  expectNothingPastRightEdge,
  expectTargetsMeetMinimumSize,
  expectVaryAccept,
  LOCALES,
  openInTheme,
  pageUrl,
  THEMES,
  wordsOverflowingTheirCell,
} from "./support";

const PAIRS = ["lingo", "tolgee", "weblate", "crowdin", "lokalise", "phrase", "manual"] as const;
const MATRIX_WIDTHS = [1160, 1280, 1440, 1920, 2560];
const ALL_WIDTHS = [320, 375, 391, 768, 1024, 1159, ...MATRIX_WIDTHS];
const HEADER_HEIGHT = 56;

for (const locale of LOCALES) {
  const url = pageUrl(locale, "/compare");

  test.describe(`comparison page ${url}`, () => {
    for (const theme of THEMES) {
      for (const width of [391, 1440]) {
        test(`has no axe violations in the ${theme} theme at ${width}px`, async ({ page }) => {
          await page.setViewportSize({ width, height: 900 });
          await openInTheme(page, url, theme);
          await expectNoAxeViolations(page);
        });
      }
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
      expectVaryAccept(explicit);
      const body = await explicit.text();
      expect(body).toContain("| --- |");
      expect(body).toContain("1. Verbatra: ");
      const negotiated = await request.get(url, { headers: { accept: "text/markdown" } });
      expect(negotiated.headers()["content-type"]).toContain("text/markdown");
      expectVaryAccept(negotiated);
      const html = await request.get(url, { headers: { accept: "text/html" } });
      expect(html.headers()["content-type"]).toContain("text/html");
    });

    for (const width of [320, 375]) {
      test(`keeps every visible element inside the viewport at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await page.goto(url);
        await expectNoHorizontalScroll(page);
        await expectNothingPastRightEdge(page);
      });
    }

    for (const width of [1160, 1280, 1440]) {
      test(`neither breaks nor overflows a word of the matrix at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(url);
        const cells = "main .vk-compare-table :is(th, td)";
        const broken = await page.evaluate(brokenWordPiecesIn, cells);
        const spilled = await page.evaluate(wordsOverflowingTheirCell, cells);
        expect(broken.checked).toBeGreaterThan(0);
        expect(broken.found).toEqual([]);
        expect(spilled.found).toEqual([]);
      });
    }

    for (const width of [320, 391]) {
      test(`neither breaks nor overflows a word of the pair view at ${width}px`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 800 });
        for (const tool of PAIRS) {
          await page.goto(`${url}?tool=${tool}`);
          await expect(page.locator("main .vk-compare-picker select")).toHaveValue(tool);
          const cells = `main [data-pair="${tool}"] :is(dt, dd)`;
          const spilled = await page.evaluate(wordsOverflowingTheirCell, cells);
          const broken = await page.evaluate(brokenWordPiecesIn, cells);
          expect(spilled.checked, tool).toBeGreaterThan(0);
          expect(spilled.found, tool).toEqual([]);
          expect(broken.found, tool).toEqual([]);
        }
      });
    }
  });
}

test.describe("comparison layout", () => {
  for (const width of ALL_WIDTHS) {
    test(`never scrolls sideways at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/compare");
      await expectNoHorizontalScroll(page);
      await expectNothingPastRightEdge(page);
    });
  }

  for (const width of MATRIX_WIDTHS) {
    test(`shows the full eight column matrix and no pair view at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/compare");
      await expect(page.locator("main .vk-compare-table")).toBeVisible();
      await expect(page.locator("main thead th")).toHaveCount(9);
      await expect(page.locator("main [data-compare-pairs]")).toBeHidden();
      await expect(page.locator("main .vk-compare-picker")).toBeHidden();
      const table = await page.locator("main .vk-compare-table").boundingBox();
      expect(table?.width ?? 0).toBeLessThanOrEqual(width);
    });
  }

  test("shows Verbatra beside one tool, not the matrix, below the matrix breakpoint", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto("/compare");
    await expect(page.locator("main .vk-compare-table")).toBeHidden();
    await expect(page.locator("main .vk-compare-picker select")).toBeVisible();
    await expect(page.locator('main [data-pair="lingo"]')).toBeVisible();
    await expect(page.locator('main [data-pair="tolgee"]')).toBeHidden();
  });

  test("keeps the header row stuck under the site header while the table scrolls", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/compare");
    await page.locator('main tr[data-row="formats"]').scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, 200));
    const head = await page.locator("main thead th[data-column='verbatra']").boundingBox();
    expect(Math.abs((head?.y ?? 0) - HEADER_HEIGHT)).toBeLessThanOrEqual(1);
    for (const tool of ["verbatra", "lingo", "manual"])
      await expect(page.locator(`main thead th[data-column='${tool}']`)).toBeInViewport();
  });

  for (const tool of PAIRS) {
    test(`shows Verbatra and ${tool} fully at 391px`, async ({ page }) => {
      await page.setViewportSize({ width: 391, height: 844 });
      await page.goto(`/compare?tool=${tool}`);
      await expect(page.locator("main .vk-compare-picker select")).toHaveValue(tool);
      await expect(page.locator(`main [data-pair="${tool}"]`)).toBeVisible();
      await expectEveryCompareCellVisible(page, tool);
    });
  }

  test("starts on Lingo.dev and changes the URL when another tool is picked, which survives a reload", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 391, height: 844 });
    await page.goto("/compare");
    const select = page.locator("main .vk-compare-picker select");
    await expect(select).toHaveValue("lingo");
    await expect
      .poll(() => page.locator("main [data-pair]").evaluateAll((nodes) => nodes.length))
      .toBe(7);
    await select.selectOption("crowdin");
    await expect(page).toHaveURL(/\/compare\?tool=crowdin$/);
    await expect(page.locator('main [data-pair="crowdin"]')).toBeVisible();
    await expect(page.locator('main [data-pair="lingo"]')).toBeHidden();
    await page.reload();
    await expect(select).toHaveValue("crowdin");
    await expect(page.locator('main [data-pair="crowdin"]')).toBeVisible();
    await expect(page.locator('main [data-pair="lingo"]')).toBeHidden();
  });

  test("shows at least two comparison rows inside the first 391x844 screen", async ({ page }) => {
    await page.setViewportSize({ width: 391, height: 844 });
    await page.goto("/compare");
    const inside = await page
      .locator('main [data-pair="lingo"] [data-row]')
      .evaluateAll((rows, height) => {
        return rows.filter((row) => row.getBoundingClientRect().bottom <= height).length;
      }, 844);
    expect(inside).toBeGreaterThanOrEqual(2);
  });

  test("puts the first matrix row within 400px of the page top at 1440px", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/compare");
    const row = await page.locator("main tbody tr").first().boundingBox();
    expect(row?.y ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(400);
  });
});

test.describe("comparison without JavaScript", () => {
  test.use({ javaScriptEnabled: false, viewport: { width: 391, height: 844 } });

  test("holds all seven pairs as collapsed sections that open on a click", async ({ page }) => {
    await page.goto("/compare");
    const pairs = page.locator("main details[data-pair]");
    await expect(pairs).toHaveCount(7);
    await expect(page.locator("main .vk-compare-picker")).toBeHidden();
    await expect(pairs.first()).toHaveJSProperty("open", true);
    for (const tool of PAIRS.slice(1)) {
      const pair = page.locator(`main details[data-pair="${tool}"]`);
      await expect(pair).toHaveJSProperty("open", false);
      await expect(pair.locator("summary")).toBeVisible();
    }
    await page.locator('main details[data-pair="tolgee"] summary').click();
    await expect(page.locator('main details[data-pair="tolgee"]')).toHaveJSProperty("open", true);
  });
});

test.describe("comparison without JavaScript on a desktop", () => {
  test.use({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });

  test("still shows the whole matrix", async ({ page }) => {
    await page.goto("/compare");
    await expect(page.locator("main .vk-compare-table")).toBeVisible();
    await expect(page.locator("main tbody tr")).toHaveCount(12);
  });
});

test.describe("comparison keyboard", () => {
  for (const width of [391, 1440]) {
    test(`passes the comparison in one Tab stop at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/compare");
      const skip = page.locator("main a[data-skip]");
      await skip.focus();
      await expect(skip).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/#compare-next$/);
      await page.keyboard.press("Tab");
      await expect(page.locator("main #compare-next a").first()).toBeFocused();
    });
  }
});

test.describe("comparison sources", () => {
  for (const width of [391, 1440]) {
    test(`gives every source link a 24px target at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/compare");
      const links = page.locator("main a[data-source]");
      const visible = await links.evaluateAll((nodes) =>
        nodes
          .filter((node) => node.checkVisibility())
          .map((node) => {
            const box = node.getBoundingClientRect();
            return [Math.round(box.width), Math.round(box.height)];
          }),
      );
      expect(visible.length).toBeGreaterThan(0);
      for (const [boxWidth, boxHeight] of visible) {
        expect(boxWidth).toBeGreaterThanOrEqual(24);
        expect(boxHeight).toBeGreaterThanOrEqual(24);
      }
      await expectTargetsMeetMinimumSize(page, "main a[data-source]");
    });
  }

  test("names each source link by tool, criterion and source and links the cited page", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/compare");
    const link = page.locator('main tr[data-row="translatorUi"] td[data-column="lingo"] a').first();
    await expect(link).toHaveAttribute(
      "href",
      "https://lingo.dev/en/docs/api/pipeline/human-review",
    );
    await expect(
      page.getByRole("link", { name: /^Lingo\.dev, .*, source$/ }).first(),
    ).toBeVisible();
    expect(await link.evaluate((node) => node.textContent)).toMatch(/Lingo\.dev/);
  });

  test("has no source list, no footnote numbers and no source anchors", async ({ page }) => {
    await page.goto("/compare");
    await expect(page.locator("main ol")).toHaveCount(0);
    await expect(page.locator("main [data-footnotes]")).toHaveCount(0);
    await expect(page.locator("main [id^='source-']")).toHaveCount(0);
  });
});

for (const path of ["/compare", "/fr/compare"]) {
  for (const width of [320, 375]) {
    test(`reflows ${path} at ${width}px with the pair view inside the viewport`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(path);
      await expectNoHorizontalScroll(page);
      await expectNothingPastRightEdge(page);
    });
  }
}
