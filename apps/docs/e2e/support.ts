import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "playwright/test";
import type { Locale } from "@/lib/i18n";
import { THEME_STORAGE_KEY, THEMES, type ThemeName } from "@/lib/theme";

export const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] as const;

const LOCALE_PREFIXES: Readonly<Record<Locale, string>> = {
  en: "",
  de: "/de",
  es: "/es",
  fr: "/fr",
};

export const LOCALES = Object.keys(LOCALE_PREFIXES) as ReadonlyArray<Locale>;

export { THEMES, type ThemeName };

export const LEGAL_PAGES = ["/imprint", "/privacy", "/licenses", "/contact"] as const;

export function homeUrl(locale: Locale): string {
  return LOCALE_PREFIXES[locale] || "/";
}

export function pageUrl(locale: Locale, path: string): string {
  return `${LOCALE_PREFIXES[locale]}${path}`;
}

export async function applyTheme(page: Page, theme: ThemeName): Promise<void> {
  await page.emulateMedia({ colorScheme: theme });
  await page.addInitScript(
    ([key, value]) => {
      try {
        window.localStorage.setItem(key, value);
      } catch {}
    },
    [THEME_STORAGE_KEY, theme] as const,
  );
}

export async function openInTheme(page: Page, url: string, theme: ThemeName): Promise<void> {
  await applyTheme(page, theme);
  await page.goto(url);
  await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${theme}\\b`));
}

export async function expectNoAxeViolations(page: Page, include?: string): Promise<void> {
  const builder = new AxeBuilder({ page }).withTags([...WCAG_TAGS]);
  if (include !== undefined) builder.include(include);
  const { passes, violations } = await builder.analyze();
  expect(passes.length).toBeGreaterThan(0);
  const summary = violations.map(({ id, impact, nodes }) => ({
    id,
    impact,
    targets: nodes.map((node) => node.target.join(" ")),
  }));
  expect(summary).toEqual([]);
}

export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth - root.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(0);
}

export async function expectEdgeRefsReachable(page: Page, scope: string): Promise<void> {
  const region = page.locator(`${scope} [data-compare-scroll]`);
  const rows = await page.locator(`${scope} tbody tr[data-row]`).count();
  for (let row = 0; row < rows; row += 1) {
    const refs = page
      .locator(`${scope} tbody tr[data-row] >> nth=${row}`)
      .locator("[data-footnotes] a");
    const count = await refs.count();
    await refs.nth(count - 2).focus();
    await page.keyboard.press("Tab");
    const last = refs.nth(count - 1);
    await expect(last).toBeFocused();
    await expect(page.locator(`${scope} .vk-compare-fade`)).toBeHidden();
    const frame = await region.boundingBox();
    const sticky = await page
      .locator(`${scope} tbody tr[data-row] >> nth=${row}`)
      .locator("th")
      .boundingBox();
    const box = await last.boundingBox();
    if (!frame || !sticky || !box) throw new Error("a box is missing");
    expect(box.x - 3, `row ${row}`).toBeGreaterThanOrEqual(sticky.x + sticky.width - 1);
    expect(box.x + box.width + 3, `row ${row}`).toBeLessThanOrEqual(frame.x + frame.width + 0.5);
  }
}

export async function expectStickyLabelsFit(page: Page, scope: string): Promise<void> {
  const overflowing = await page.locator(`${scope} .vk-compare-sticky`).evaluateAll((cells) =>
    cells
      .filter((cell) => {
        const node = cell as HTMLElement;
        node.style.overflowWrap = "normal";
        const overflows = node.scrollWidth > node.clientWidth + 0.5;
        node.style.overflowWrap = "";
        return overflows;
      })
      .map((cell) => cell.textContent),
  );
  expect(overflowing).toEqual([]);
}
