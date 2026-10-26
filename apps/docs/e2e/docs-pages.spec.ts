import { expect, type Page, test } from "playwright/test";
import {
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
          test.fixme(
            path === "/docs/sdk" && theme === "light",
            "color-contrast 4.35:1 (#d73a49 on #f9f9fb, needs 4.5:1) on the shiki keyword spans in the fumadocs TypeTable signature cells #sdk-SdkFs-* > .py-2.px-3.group > .@max-xl:hidden > .shiki > code > span",
          );
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
          expect(await drawer.evaluate((node) => node.scrollWidth - node.clientWidth)).toBe(0);
          await expectNoHorizontalScroll(page);
          await expectNothingPastRightEdge(page);
        });
      }
    });
  }
}
