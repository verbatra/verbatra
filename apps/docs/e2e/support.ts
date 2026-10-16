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
