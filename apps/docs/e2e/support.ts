import AxeBuilder from "@axe-core/playwright";
import { type APIResponse, expect, type Page } from "playwright/test";
import { FAQ_KEYS_ATTACHED } from "@/components/landing/faq-keys";
import { LOCALES, type Locale, localePrefix } from "@/lib/locales";
import { THEME_STORAGE_KEY, THEMES, type ThemeName } from "@/lib/theme";

export const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] as const;

export { LOCALES, THEMES, type ThemeName };

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
  return localePrefix(locale) || "/";
}

export function pageUrl(locale: Locale, path: string): string {
  return `${localePrefix(locale)}${path}`;
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

type WordScan = {
  selector: string;
  split: "space" | "piece";
  check: "broken" | "overflow" | "snug";
};

type WordFindings = { found: string[]; checked: number };

export const brokenWords = (selector: string): WordScan => ({
  selector,
  split: "space",
  check: "broken",
});

export const brokenWordPieces = (selector: string): WordScan => ({
  selector,
  split: "piece",
  check: "broken",
});

export const overflowingWords = (selector: string): WordScan => ({
  selector,
  split: "piece",
  check: "overflow",
});

export const wordsWithoutMargin = (selector: string): WordScan => ({
  selector,
  split: "piece",
  check: "snug",
});

export function wordsFailing({ selector, split, check }: WordScan): WordFindings {
  const spaceless = /^(zh|ja|th|lo|km|my)\b/.test(document.documentElement.lang);
  const patternOf = (node: Text): RegExp => {
    if (split === "space") return /\S+/g;
    if (check === "overflow" || !spaceless || node.parentElement?.closest(".vk-compare-unit"))
      return /[^\s\-/]+/g;
    return /[A-Za-z0-9_][A-Za-z0-9_.:@]*/g;
  };
  const textNodes = (root: Element): Text[] => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node as Text);
    return nodes;
  };
  const rangeOf = (node: Text, match: RegExpMatchArray): Range => {
    const range = document.createRange();
    range.setStart(node, match.index ?? 0);
    range.setEnd(node, (match.index ?? 0) + match[0].length);
    return range;
  };
  const isBroken = (range: Range): boolean =>
    new Set(Array.from(range.getClientRects(), (rect) => Math.round(rect.top))).size > 1;
  const wordsFailingIn = (anchor: Element): string[] => {
    const style = getComputedStyle(anchor);
    const limit = anchor.getBoundingClientRect().right - Number.parseFloat(style.paddingRight);
    const room =
      anchor.getBoundingClientRect().width -
      Number.parseFloat(style.paddingLeft) -
      Number.parseFloat(style.paddingRight);
    const spoken = textNodes(anchor).filter(
      (node) => check === "broken" || !node.parentElement?.closest(".sr-only"),
    );
    return spoken.flatMap((node) =>
      Array.from(node.data.matchAll(patternOf(node)))
        .filter((match) => {
          const range = rangeOf(node, match);
          if (check === "broken") return isBroken(range);
          if (check === "snug") return range.getBoundingClientRect().width > room - 4;
          return range.getBoundingClientRect().right > limit + 0.5;
        })
        .map((match) => match[0]),
    );
  };
  const anchors = Array.from(document.querySelectorAll(selector));
  return { found: anchors.flatMap(wordsFailingIn), checked: anchors.length };
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

export function arrowsAloneOnTheirLine(selector: string): { found: string[]; checked: number } {
  const lastTextLine = (cell: Element): DOMRect | undefined => {
    const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
    let line: DOMRect | undefined;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.parentElement?.closest(".sr-only") || !node.textContent?.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      line = Array.from(range.getClientRects()).at(-1) ?? line;
    }
    return line;
  };
  const isAlone = (cell: Element): boolean => {
    const link = cell.querySelector("a[data-source]")?.getBoundingClientRect();
    const line = lastTextLine(cell);
    return link !== undefined && line !== undefined && link.top + link.height / 2 > line.bottom;
  };
  const cells = Array.from(document.querySelectorAll(selector)).filter(
    (cell) => cell.checkVisibility() && cell.querySelectorAll("a[data-source]").length === 1,
  );
  return {
    found: cells.filter(isAlone).map((cell) => cell.textContent?.trim() ?? ""),
    checked: cells.length,
  };
}

export async function expectBackwardWalkClearsStickyHead(page: Page, scope: string): Promise<void> {
  const selector = `${scope} a[data-source]`;
  const links = page.locator(selector);
  const count = await links.count();
  expect(count).toBeGreaterThan(0);
  await links.nth(count - 1).focus();
  const hidden: string[] = [];
  let visited = 0;
  for (let step = 0; step < count; step += 1) {
    const state = await page.evaluate(async (query) => {
      const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
      let still = 0;
      let last = window.scrollY;
      while (still < 3) {
        await frame();
        still = window.scrollY === last ? still + 1 : 0;
        last = window.scrollY;
      }
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || !active.matches(query)) return null;
      const box = active.getBoundingClientRect();
      const heads = Array.from(
        document.querySelectorAll("main thead th"),
        (th) => th.getBoundingClientRect().bottom,
      );
      const header = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
      const covered = Math.max(header, ...heads);
      return {
        clear: box.top >= covered - 0.5 && box.bottom <= window.innerHeight + 0.5,
        label: active.querySelector(".sr-only")?.textContent ?? "",
      };
    }, selector);
    if (state === null) break;
    visited += 1;
    if (!state.clear) hidden.push(state.label);
    await page.keyboard.press("Shift+Tab");
  }
  expect(visited).toBe(count);
  expect(hidden).toEqual([]);
}

type ShiftEntry = PerformanceEntry & {
  value: number;
  hadRecentInput: boolean;
  sources?: Array<{ node: Node | null }>;
};

type ShiftState = {
  total: number;
  sources: string[];
  observer: PerformanceObserver;
  take: (entries: PerformanceEntryList) => void;
};

export async function installShiftCounter(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const state = { total: 0, sources: [] as string[] } as ShiftState;
    state.take = (entries) => {
      for (const entry of entries as ShiftEntry[]) {
        if (entry.hadRecentInput) continue;
        state.total += entry.value;
        for (const source of entry.sources ?? [])
          state.sources.push(
            `${entry.value.toFixed(4)} at ${Math.round(entry.startTime)}ms ${(source.node as Element | null)?.className ?? source.node?.nodeName}`,
          );
      }
    };
    state.observer = new PerformanceObserver((list) => state.take(list.getEntries()));
    state.observer.observe({ type: "layout-shift", buffered: true });
    (window as unknown as { shifts: ShiftState }).shifts = state;
  });
}

async function drainedShifts(page: Page): Promise<{ total: number; sources: string[] }> {
  return page.evaluate(() => {
    const state = (window as unknown as { shifts: ShiftState }).shifts;
    state.take(state.observer.takeRecords());
    return { total: state.total, sources: state.sources };
  });
}

export async function layoutShift(page: Page): Promise<number> {
  return (await drainedShifts(page)).total;
}

export async function layoutShiftSources(page: Page): Promise<string[]> {
  return (await drainedShifts(page)).sources;
}

export type GateRest = {
  frames: number;
  full: number;
  problems: string[];
  minContrast: number;
  pastEdge: number;
  current: number;
};

export type GateHandoff = {
  at: number;
  frames: number[];
  captions: number[];
  cards: number[];
  scales: number[];
};

export type GateFlip = { wait: number; to: number };

export type GateReversal = { from: number; to: number; delay: number; home: number };

export type GateReversalResult = {
  delay: number;
  joint: number;
  settle: number;
  final: number[];
};

declare global {
  interface Window {
    gateProbe?: {
      settle: () => Promise<boolean>;
      rest: () => GateRest;
      handoff: (length: number, flips: GateFlip[]) => Promise<GateHandoff[]>;
      reversals: (trials: GateReversal[], tail: number) => Promise<GateReversalResult[]>;
      armScrollEnd: () => void;
      scrollEnded: () => Promise<void>;
    };
  }
}

export function installGateProbe(): void {
  const frames = (): Element[] => [...document.querySelectorAll(".vk-gate-frame")];
  const nextFrame = (): Promise<void> =>
    new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  const runningTransitions = (): number =>
    document
      .getAnimations()
      .filter(
        (animation) =>
          animation instanceof CSSTransition &&
          animation.playState !== "finished" &&
          animation.playState !== "idle",
      ).length;
  const settle = async (): Promise<boolean> => {
    await nextFrame();
    const started = performance.now();
    while (runningTransitions() > 0) {
      if (performance.now() - started > 3000) return false;
      await nextFrame();
    }
    await nextFrame();
    return true;
  };
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
  const parsed = new Map<string, [number, number, number, number]>();
  const colour = (value: string): [number, number, number, number] => {
    const known = parsed.get(value);
    if (known) return known;
    context.fillStyle = "#123456";
    context.fillStyle = value;
    if (context.fillStyle === "#123456" && value.replace(/\s/g, "") !== "#123456")
      throw new Error(`unparseable colour ${value}`);
    context.clearRect(0, 0, 1, 1);
    context.fillRect(0, 0, 1, 1);
    const [r = 0, g = 0, b = 0, a = 0] = context.getImageData(0, 0, 1, 1).data;
    const result: [number, number, number, number] = [r, g, b, a / 255];
    parsed.set(value, result);
    return result;
  };
  const over = (
    top: [number, number, number, number],
    bottom: [number, number, number, number],
  ): [number, number, number, number] => {
    const alpha = top[3] + bottom[3] * (1 - top[3]);
    if (alpha === 0) return [0, 0, 0, 0];
    const mix = (index: 0 | 1 | 2): number =>
      (top[index] * top[3] + bottom[index] * bottom[3] * (1 - top[3])) / alpha;
    return [mix(0), mix(1), mix(2), alpha];
  };
  const luminance = ([r, g, b]: [number, number, number, number]): number => {
    const channel = (value: number): number => {
      const unit = value / 255;
      return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };
  const withOpacity = (
    layer: [number, number, number, number],
    opacity: number,
  ): [number, number, number, number] => [layer[0], layer[1], layer[2], layer[3] * opacity];
  const chains = new Map<Element, number>();
  const layers = new Map<Element, [number, number, number, number]>();
  const chainOpacity = (element: Element): number => {
    const known = chains.get(element);
    if (known !== undefined) return known;
    const parent = element.parentElement;
    const value = Number(getComputedStyle(element).opacity) * (parent ? chainOpacity(parent) : 1);
    chains.set(element, value);
    return value;
  };
  const layerOf = (element: Element): [number, number, number, number] => {
    const known = layers.get(element);
    if (known) return known;
    const value = withOpacity(
      colour(getComputedStyle(element).backgroundColor),
      chainOpacity(element),
    );
    layers.set(element, value);
    return value;
  };
  const backdrop = (element: Element): [number, number, number, number] => {
    const stack: Array<[number, number, number, number]> = [];
    for (let node: Element | null = element; node; node = node.parentElement)
      stack.push(layerOf(node));
    return stack.reduceRight((below, layer) => over(layer, below), [255, 255, 255, 1] as [
      number,
      number,
      number,
      number,
    ]);
  };
  const contrast = (element: Element): number => {
    const bottom = backdrop(element);
    const text = over(
      withOpacity(colour(getComputedStyle(element).color), chainOpacity(element)),
      bottom,
    );
    const [lighter, darker] = [luminance(text), luminance(bottom)].sort((a, b) => b - a) as [
      number,
      number,
    ];
    return (lighter + 0.05) / (darker + 0.05);
  };
  const zero = (value: string): boolean =>
    value === "none" || value.split(" ").every((part) => Number.parseFloat(part) === 0);
  const unscaled = (value: string): boolean =>
    value === "none" || value.split(" ").every((part) => Number.parseFloat(part) === 1);
  const partProblems = (name: string, part: Element): string[] => {
    const style = getComputedStyle(part);
    return [
      zero(style.translate) ? "" : `${name} offset ${style.translate}`,
      unscaled(style.scale) ? "" : `${name} scale ${style.scale}`,
      style.transform === "none" ? "" : `${name} transform`,
      Number(style.opacity) === 1 ? "" : `${name} part opacity`,
    ].filter((problem) => problem !== "");
  };
  const accentProblems = (name: string, accent: Element): string[] => {
    const style = getComputedStyle(accent);
    return [
      Number(style.opacity) === 1 ? "" : `${name} accent ${style.opacity}`,
      zero(style.translate) ? "" : `${name} accent ${style.translate}`,
      unscaled(style.scale) ? "" : `${name} accent ${style.scale}`,
    ].filter((problem) => problem !== "");
  };
  const lineProblems = (name: string, line: Element): string[] => {
    const style = getComputedStyle(line);
    return Number(style.opacity) === 1 && zero(style.translate)
      ? []
      : [`${name} line ${line.textContent?.slice(0, 20)}`];
  };
  const currentProblems = (node: Element, name: string): string[] => {
    const parts = [
      node.querySelector(":scope > figcaption"),
      node.querySelector(":scope > .vk-gate-card"),
    ] as Element[];
    return [
      getComputedStyle(node).pointerEvents === "none" ? `${name} has no pointer` : "",
      ...parts.flatMap((part) => partProblems(name, part)),
      ...[...node.querySelectorAll(".vk-gate-moves")].flatMap((a) => accentProblems(name, a)),
      ...[...node.querySelectorAll(".vk-lock-line")].flatMap((line) => lineProblems(name, line)),
    ].filter((problem) => problem !== "");
  };
  const hiddenProblems = (node: Element, name: string): string[] => {
    const style = getComputedStyle(node);
    return [
      Number(style.opacity) === 0 ? "" : `${name} opacity ${style.opacity}`,
      style.pointerEvents === "none" ? "" : `${name} pointer ${style.pointerEvents}`,
    ].filter((problem) => problem !== "");
  };
  const lowestContrast = (active: Element): number => {
    const walker = document.createTreeWalker(active, NodeFilter.SHOW_TEXT);
    let lowest = Number.POSITIVE_INFINITY;
    for (let text = walker.nextNode(); text; text = walker.nextNode()) {
      const owner = text.parentElement;
      if (owner && (text.textContent ?? "").trim() !== "")
        lowest = Math.min(lowest, contrast(owner));
    }
    return lowest;
  };
  const countPastEdge = (active: Element): number => {
    const { clientWidth, clientHeight } = document.documentElement;
    return [active, ...active.querySelectorAll("*")].filter((element) => {
      const box = element.getBoundingClientRect();
      return (
        box.width > 0 &&
        (box.left < -1 ||
          box.right > clientWidth + 1 ||
          box.top < -1 ||
          box.bottom > clientHeight + 1)
      );
    }).length;
  };
  const rest = (): GateRest => {
    chains.clear();
    layers.clear();
    const list = frames();
    const opacities = list.map((node) => Number(getComputedStyle(node).opacity));
    const current = opacities.indexOf(1);
    const problems = list.flatMap((node, index) => {
      const name = node.getAttribute("data-state") ?? String(index);
      return index === current ? currentProblems(node, name) : hiddenProblems(node, name);
    });
    const active = list[current];
    return {
      frames: list.length,
      full: opacities.filter((opacity) => opacity === 1).length,
      problems,
      minContrast: active ? lowestContrast(active) : Number.POSITIVE_INFINITY,
      pastEdge: active ? countPastEdge(active) : 0,
      current,
    };
  };
  const translateX = (element: Element): number =>
    Number.parseFloat(getComputedStyle(element).translate) || 0;
  const scaleOf = (element: Element): number => {
    const scale = getComputedStyle(element).scale;
    return scale === "none" ? 1 : Number.parseFloat(scale);
  };
  const reading = (started: number): GateHandoff => {
    const list = frames();
    const parts = (selector: string): Element[] =>
      list.map((node) => node.querySelector(selector) as Element);
    return {
      at: performance.now() - started,
      frames: list.map((node) => Number(getComputedStyle(node).opacity)),
      captions: parts(":scope > figcaption").map(translateX),
      cards: parts(":scope > .vk-gate-card").map(translateX),
      scales: parts(":scope > .vk-gate-card").map(scaleOf),
    };
  };
  const handoff = (length: number, flips: GateFlip[]): Promise<GateHandoff[]> =>
    new Promise((resolve) => {
      const samples: GateHandoff[] = [];
      const started = performance.now();
      const schedule = flips.map((flip, index) => ({
        at: flips.slice(0, index + 1).reduce((sum, item) => sum + item.wait, 0),
        to: flip.to,
      }));
      let next = 0;
      const tick = (): void => {
        const elapsed = performance.now() - started;
        const due = schedule[next];
        if (due && elapsed >= due.at) {
          window.scrollTo(0, due.to);
          next += 1;
        }
        samples.push(reading(started));
        if (elapsed < length) requestAnimationFrame(tick);
        else resolve(samples);
      };
      requestAnimationFrame(tick);
    });
  let scrollEnd: Promise<void> = Promise.resolve();
  const armScrollEnd = (): void => {
    scrollEnd = new Promise((resolve) => {
      const fallback = window.setTimeout(resolve, 800);
      window.addEventListener(
        "scrollend",
        () => {
          window.clearTimeout(fallback);
          resolve();
        },
        { once: true },
      );
    });
  };
  const scrollEnded = async (): Promise<void> => {
    await scrollEnd;
    const started = performance.now();
    let still = 0;
    let last = window.scrollY;
    while (still < 4 && performance.now() - started < 2000) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      still = window.scrollY === last ? still + 1 : 0;
      last = window.scrollY;
    }
  };
  const jointOf = (samples: GateHandoff[]): number =>
    Math.max(
      ...samples.map((sample) => {
        const [first = 0, second = 0] = [...sample.frames].sort((a, b) => b - a);
        return Math.min(first, second);
      }),
    );
  const reversal = async (trial: GateReversal, tail: number): Promise<GateReversalResult> => {
    window.scrollTo(0, trial.from);
    await settle();
    const samples = await handoff(trial.delay + tail, [
      { wait: 0, to: trial.to },
      { wait: trial.delay, to: trial.from },
    ]);
    const exact = (sample: GateHandoff): boolean =>
      sample.frames.every((opacity, index) => opacity === (index === trial.home ? 1 : 0));
    const lastBad = samples.findLastIndex((sample) => !exact(sample));
    const final = samples.at(-1)?.frames ?? [];
    return {
      delay: trial.delay,
      joint: jointOf(samples),
      settle: (samples[lastBad + 1]?.at ?? Number.POSITIVE_INFINITY) - trial.delay,
      final,
    };
  };
  const reversals = async (trials: GateReversal[], tail: number): Promise<GateReversalResult[]> => {
    const results: GateReversalResult[] = [];
    for (const trial of trials) results.push(await reversal(trial, tail));
    return results;
  };
  window.gateProbe = { settle, rest, handoff, reversals, armScrollEnd, scrollEnded };
}
