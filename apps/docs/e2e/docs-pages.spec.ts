import { expect, type Page, test } from "playwright/test";
import {
  brokenWordsIn,
  DOCS_PAGES,
  expectNoAxeViolations,
  expectNoHorizontalScroll,
  expectNothingPastRightEdge,
  LOCALES,
  openInTheme,
  pageUrl,
  THEMES,
} from "./support";

const REFLOW_WIDTHS = [320, 375] as const;

async function openDocsPage(page: Page, url: string): Promise<void> {
  const response = await page.goto(url);
  expect(response?.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe(url);
  await expect(page.locator("#nd-page")).toBeVisible();
}

for (const locale of LOCALES) {
  for (const path of DOCS_PAGES) {
    const url = pageUrl(locale, path);

    test.describe(`docs ${url}`, () => {
      if (path === "/docs/error-codes") test.slow();

      test("serves the page itself and sets html lang to the locale", async ({ page }) => {
        await openDocsPage(page, url);
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
      });

      for (const theme of THEMES) {
        test(`has no axe violations in the ${theme} theme`, async ({ page }) => {
          await openInTheme(page, url, theme);
          expect(new URL(page.url()).pathname).toBe(url);
          await expectNoAxeViolations(page);
        });
      }

      for (const width of REFLOW_WIDTHS) {
        test(`reflows at ${width}px with every visible element inside the viewport`, async ({
          page,
        }) => {
          await page.setViewportSize({ width, height: 800 });
          await openDocsPage(page, url);
          await expectNoHorizontalScroll(page);
          await expectNothingPastRightEdge(page);
        });

        test(`opens the mobile navigation at ${width}px without overflow`, async ({ page }) => {
          await page.setViewportSize({ width, height: 800 });
          await openDocsPage(page, url);
          const trigger = page.locator('#nd-subnav button[aria-controls="nd-sidebar-mobile"]');
          await expect(trigger).toBeVisible();
          await expect(trigger).toHaveAttribute("aria-expanded", "false");
          await trigger.click();
          await expect(trigger).toHaveAttribute("aria-expanded", "true");
          const drawer = page.locator("#nd-sidebar-mobile");
          await expect(drawer).toBeVisible();
          await expect(drawer.getByRole("link").first()).toBeVisible();
          await expect
            .poll(async () => {
              const box = await drawer.boundingBox();
              return box === null ? null : [box.x >= 0, box.x + box.width <= width + 0.5];
            })
            .toEqual([true, true]);
          await expect
            .poll(() => drawer.evaluate((node) => node.scrollWidth - node.clientWidth))
            .toBe(0);
          await expectNoHorizontalScroll(page);
          await expectNothingPastRightEdge(page);
        });
      }
    });
  }
}

test.describe("docs shell on a phone", () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test("keeps focus inside the open navigation sheet and returns it to the trigger on Escape", async ({
    page,
  }) => {
    await openDocsPage(page, "/docs/cli/translate");
    const trigger = page.locator('#nd-subnav button[aria-controls="nd-sidebar-mobile"]');
    await trigger.click();
    const drawer = page.locator("#nd-sidebar-mobile");
    await expect(drawer).toBeVisible();
    await expect
      .poll(() => drawer.evaluate((node) => node.contains(document.activeElement)))
      .toBe(true);
    let triggerFocused = 0;
    for (let press = 0; press < 40; press += 1) {
      await page.keyboard.press("Tab");
      if (await trigger.evaluate((node) => node === document.activeElement)) triggerFocused += 1;
      const inside = await page.evaluate(() => {
        const active = document.activeElement;
        return (
          active !== null &&
          (document.getElementById("nd-sidebar-mobile")?.contains(active) === true ||
            active.matches('#nd-subnav button[aria-controls="nd-sidebar-mobile"]'))
        );
      });
      expect(inside, `focus after Tab ${press + 1}`).toBe(true);
    }
    expect(triggerFocused).toBeGreaterThan(0);
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("moves focus to the new page and leaves nothing inert after a link in the sheet", async ({
    page,
  }) => {
    await openDocsPage(page, "/docs/cli/translate");
    await page.locator('#nd-subnav button[aria-controls="nd-sidebar-mobile"]').click();
    await page.locator('#nd-sidebar-mobile a[href="/docs/cli/watch"]').click();
    await page.waitForURL(/\/docs\/cli\/watch$/);
    await expect(page.locator("#nd-sidebar-mobile")).toBeHidden();
    await expect
      .poll(() =>
        page.evaluate(() => document.activeElement === document.getElementById("nd-page")),
      )
      .toBe(true);
    await expect(page.locator("[inert]")).toHaveCount(0);
  });

  test("underlines the original-language link of the translation notice in the accent color", async ({
    page,
  }) => {
    await openDocsPage(page, "/de/docs/cli/translate");
    const link = page.locator(".vk-callout a").first();
    await expect(link).toBeVisible();
    const style = await link.evaluate((node) => {
      const probe = document.createElement("span");
      probe.style.color = "var(--accent)";
      document.body.append(probe);
      const accent = getComputedStyle(probe).color;
      probe.remove();
      const computed = getComputedStyle(node);
      return {
        color: computed.color,
        accent,
        underline: computed.textDecorationLine,
        width: node.closest(".vk-callout")?.getBoundingClientRect().width ?? 0,
      };
    });
    expect(style.color).toBe(style.accent);
    expect(style.underline).toContain("underline");
    expect(style.width).toBeLessThanOrEqual(660.5);
  });

  test("shows the search input above the header when search opens", async ({ page }) => {
    await openDocsPage(page, "/docs/cli/translate");
    await page.locator("#nd-subnav [data-search]").click();
    const input = page.getByRole("combobox");
    await expect(input).toBeVisible();
    const covered = await input.evaluate((node) => {
      const box = node.getBoundingClientRect();
      const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return top === null || !(top === node || node.contains(top));
    });
    expect(covered).toBe(false);
  });

  test("never breaks a word of a heading that carries a version badge", async ({ page }) => {
    await openDocsPage(page, "/de/docs/cli/translate");
    const split = await page.evaluate(
      brokenWordsIn,
      "#nd-page :is(h2, h3, h4):has(.vk-available-from) > a[data-card]",
    );
    expect(split.checked).toBeGreaterThan(0);
    expect(split.found).toEqual([]);
  });
});

test("keeps the header links at the same position on the landing and on a docs page", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const linkX = async (url: string): Promise<number> => {
    await page.goto(url);
    const box = await page.locator('.vk-header a.vk-header-link[href="/docs"]').boundingBox();
    if (box === null) throw new Error(`no Docs link on ${url}`);
    return box.x;
  };
  const landing = await linkX("/");
  const docs = await linkX("/docs/cli/translate");
  expect(Math.abs(landing - docs)).toBeLessThanOrEqual(1);
});

test("keeps a 24px gap between the search pill and the first header link at 768px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 800 });
  await page.goto("/docs/cli/translate");
  const search = await page.locator(".vk-header-search").boundingBox();
  const link = await page.locator(".vk-header a.vk-header-link").first().boundingBox();
  if (search === null || link === null) throw new Error("header controls missing");
  expect(link.x - (search.x + search.width)).toBeGreaterThanOrEqual(24);
});
