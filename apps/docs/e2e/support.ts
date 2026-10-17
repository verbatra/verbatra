import AxeBuilder from "@axe-core/playwright";
import { type APIResponse, expect, type Locator, type Page } from "playwright/test";
import { COMPARE_FOCUS_ATTACHED } from "@/components/landing/compare-focus";
import { FAQ_KEYS_ATTACHED } from "@/components/landing/faq-keys";
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

function varyTokens(response: APIResponse): ReadonlyArray<string> {
  return response
    .headersArray()
    .filter(({ name }) => name.toLowerCase() === "vary")
    .flatMap(({ value }) => value.split(","))
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length > 0);
}

export function expectVaryAccept(response: APIResponse): void {
  expect(varyTokens(response)).toContain("accept");
}

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

export async function expectNothingPastRightEdge(page: Page): Promise<void> {
  const clipped = await page.evaluate(() => {
    const viewport = document.documentElement.clientWidth;
    const pageRoots = new Set<Element | null>([
      document.documentElement,
      document.body,
      document.querySelector(".vk-home"),
    ]);
    const scrollsOrClips = (node: Element): boolean =>
      ["auto", "scroll", "hidden", "clip"].includes(getComputedStyle(node).overflowX);
    const insideOwnClip = (node: Element): boolean => {
      for (let parent = node.parentElement; parent !== null; parent = parent.parentElement) {
        if (!pageRoots.has(parent) && scrollsOrClips(parent)) return true;
      }
      return false;
    };
    return [...document.body.querySelectorAll("*")]
      .filter((node) => {
        if (node.closest('.sr-only, [aria-hidden="true"]') !== null) return false;
        if (!node.checkVisibility()) return false;
        const box = node.getBoundingClientRect();
        if (box.width === 0 || box.height === 0 || box.right <= viewport + 0.5) return false;
        return !insideOwnClip(node);
      })
      .map((node) => {
        const label = node.id ? `#${node.id}` : `.${[...node.classList].slice(0, 2).join(".")}`;
        return `${node.tagName.toLowerCase()}${label} right=${Math.round(node.getBoundingClientRect().right)}`;
      });
  });
  expect(clipped).toEqual([]);
}

export async function expectTargetsMeetMinimumSize(page: Page, selector: string): Promise<void> {
  const failing = await page.locator(selector).evaluateAll((nodes) => {
    const boxes = nodes
      .filter((node) => node.checkVisibility())
      .map((node) => ({ node, box: node.getBoundingClientRect() }));
    const small = (box: DOMRect) => box.width < 24 || box.height < 24;
    const centre = (box: DOMRect) => [box.left + box.width / 2, box.top + box.height / 2] as const;
    return boxes
      .filter(({ node, box }) => {
        if (!small(box)) return false;
        const [x, y] = centre(box);
        return boxes.some((other) => {
          if (other.node === node) return false;
          const dx = Math.max(other.box.left - x, 0, x - other.box.right);
          const dy = Math.max(other.box.top - y, 0, y - other.box.bottom);
          if (Math.hypot(dx, dy) < 12) return true;
          if (!small(other.box)) return false;
          const [ox, oy] = centre(other.box);
          return Math.hypot(ox - x, oy - y) < 24;
        });
      })
      .map(
        ({ node, box }) =>
          `${node.textContent?.trim()} ${Math.round(box.width)}x${Math.round(box.height)}`,
      );
  });
  expect(failing).toEqual([]);
}

export async function expectClearOfPinnedColumn(
  row: Locator,
  ref: Locator,
  label: string,
): Promise<void> {
  const sticky = await row.locator("th").boundingBox();
  const box = await ref.boundingBox();
  if (!sticky || !box) throw new Error("a box is missing");
  expect(box.x - 3, label).toBeGreaterThanOrEqual(sticky.x + sticky.width - 1);
}

export async function waitForCompareFocus(page: Page): Promise<void> {
  await expect(page.locator("html")).toHaveAttribute(COMPARE_FOCUS_ATTACHED, "");
}

export async function expectBackwardWalkClearsHeader(page: Page, scope: string): Promise<void> {
  await waitForCompareFocus(page);
  const refs = page.locator(`${scope} tbody [data-footnotes] a`);
  const count = await refs.count();
  expect(count).toBeGreaterThan(0);
  await refs.nth(count - 1).focus();
  let visited = 0;
  for (let step = 0; step < count * 3 && visited < count; step += 1) {
    const state = await page.evaluate(async (selector) => {
      const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
      let still = 0;
      let last = window.scrollY;
      while (still < 3) {
        await frame();
        still = window.scrollY === last ? still + 1 : 0;
        last = window.scrollY;
      }
      const active = document.activeElement;
      const header = document.querySelector("header");
      if (!(active instanceof HTMLElement) || header === null) return null;
      return {
        isRef: active.matches(selector),
        top: active.getBoundingClientRect().top,
        headerBottom: header.getBoundingClientRect().bottom,
        label: active.getAttribute("href") ?? "",
      };
    }, `${scope} tbody [data-footnotes] a`);
    if (state === null) throw new Error("no focused element or header");
    if (state.isRef) {
      visited += 1;
      expect(state.top, `${state.label} after ${visited} refs`).toBeGreaterThanOrEqual(
        state.headerBottom - 0.5,
      );
    }
    await page.keyboard.press("Shift+Tab");
  }
  expect(visited).toBe(count);
}

export async function waitForFaqKeys(page: Page): Promise<void> {
  await expect(page.locator("#faq-list")).toHaveAttribute(FAQ_KEYS_ATTACHED, "");
}

export async function expectEdgeRefsReachable(page: Page, scope: string): Promise<void> {
  await waitForCompareFocus(page);
  const region = page.locator(`${scope} [data-compare-scroll]`);
  const rows = await page.locator(`${scope} tbody tr[data-row]`).count();
  for (let row = 0; row < rows; row += 1) {
    const refs = page
      .locator(`${scope} tbody tr[data-row] >> nth=${row}`)
      .locator("[data-footnotes] a");
    const count = await refs.count();
    if (count === 0) continue;
    const last = refs.nth(count - 1);
    if (count === 1) await last.focus();
    else {
      await refs.nth(count - 2).focus();
      await page.keyboard.press("Tab");
    }
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
  const broken = await page.locator(`${scope} .vk-compare-sticky`).evaluateAll((cells) =>
    cells.flatMap((cell) => {
      const words: string[] = [];
      const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        for (const match of (node.textContent ?? "").matchAll(/[^\s-]+-?/g)) {
          const range = document.createRange();
          range.setStart(node, match.index);
          range.setEnd(node, match.index + match[0].length);
          const lines = new Set(
            Array.from(range.getClientRects())
              .filter((rect) => rect.width > 0)
              .map((rect) => Math.round(rect.top)),
          );
          if (lines.size > 1) words.push(match[0]);
        }
      }
      return words;
    }),
  );
  expect(broken).toEqual([]);
}
