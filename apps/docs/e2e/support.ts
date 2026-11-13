import AxeBuilder from "@axe-core/playwright";
import { type APIResponse, expect, type Page } from "playwright/test";
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

export const DOCS_PAGES = [
  "/docs",
  "/docs/cli/translate",
  "/docs/config-file",
  "/docs/ci-and-exit-codes",
  "/docs/sdk",
  "/docs/sdk/run",
  "/docs/sdk/extend",
  "/docs/error-codes",
] as const;

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

export async function waitForFaqKeys(page: Page): Promise<void> {
  await expect(page.locator("#faq-list")).toHaveAttribute(FAQ_KEYS_ATTACHED, "");
}

export function brokenWordsIn(selector: string): { found: string[]; checked: number } {
  const lineCount = (node: Text, start: number, end: number): number => {
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, end);
    return new Set(Array.from(range.getClientRects(), (rect) => Math.round(rect.top))).size;
  };
  const wordsBroken = (node: Text): string[] =>
    Array.from(node.data.matchAll(/\S+/g))
      .filter((match) => lineCount(node, match.index, match.index + match[0].length) > 1)
      .map((match) => match[0]);
  const textNodes = (root: Element): Text[] => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node as Text);
    return nodes;
  };
  const anchors = Array.from(document.querySelectorAll(selector));
  return { found: anchors.flatMap(textNodes).flatMap(wordsBroken), checked: anchors.length };
}

export function brokenWordPiecesIn(selector: string): { found: string[]; checked: number } {
  const lineCount = (node: Text, start: number, end: number): number => {
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, end);
    return new Set(Array.from(range.getClientRects(), (rect) => Math.round(rect.top))).size;
  };
  const wordsBroken = (node: Text): string[] =>
    Array.from(node.data.matchAll(/[^\s\-/]+/g))
      .filter((match) => lineCount(node, match.index, match.index + match[0].length) > 1)
      .map((match) => match[0]);
  const textNodes = (root: Element): Text[] => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node as Text);
    return nodes;
  };
  const anchors = Array.from(document.querySelectorAll(selector));
  return { found: anchors.flatMap(textNodes).flatMap(wordsBroken), checked: anchors.length };
}

export async function expectEveryCompareCellVisible(page: Page, tool: string): Promise<void> {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("no viewport");
  const rows = page.locator(`main [data-pair="${tool}"] [data-row]`);
  expect(await rows.count()).toBeGreaterThan(0);
  const clipped = await page
    .locator(`main [data-pair="${tool}"] dd`)
    .evaluateAll((cells, width) => {
      return cells
        .filter((cell) => {
          const box = cell.getBoundingClientRect();
          return box.left < -0.5 || box.right > width + 0.5 || box.width === 0;
        })
        .map((cell) => cell.getAttribute("data-column") ?? "");
    }, viewport.width);
  expect(clipped).toEqual([]);
}
