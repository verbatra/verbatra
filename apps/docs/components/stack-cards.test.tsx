// @vitest-environment jsdom

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FORMAT_ID_CLASS, type StackCard, StackCards } from "./stack-cards";

const CARDS: ReadonlyArray<StackCard> = [
  { label: "React", icon: "react", formats: ["i18next-json"], href: "/docs/pick-your-stack#react" },
  {
    label: "iOS and macOS",
    icon: "apple",
    formats: ["apple-strings", "apple-xcstrings"],
    href: "#ios-and-macos",
  },
  { label: "Something else", icon: "custom", formats: [], href: "#something-else" },
];

const GLOBAL_CSS = readFileSync(join(process.cwd(), "app/global.css"), "utf8");

type GridRule = { selector: string; declaration: string; wide: boolean };

function closingBrace(css: string, open: number): number {
  let depth = 0;
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    if (css[index] === "}") depth -= 1;
    if (depth === 0) return index;
  }
  return css.length;
}

function stackGridRules(): ReadonlyArray<GridRule> {
  const css = GLOBAL_CSS.replace(/\s+/g, " ");
  const wideStart = css.indexOf("@container (min-width: 50rem) {");
  const wideEnd = closingBrace(css, css.indexOf("{", wideStart));
  return [...css.matchAll(/(\.vk-stack-grid[^{]*) \{ ([^}]*)\}/g)].map((match) => ({
    selector: (match[1] ?? "").trim(),
    declaration: (match[2] ?? "").trim(),
    wide: (match.index ?? 0) > wideStart && (match.index ?? 0) < wideEnd,
  }));
}

function matchesNth(formula: string, position: number): boolean {
  if (formula === "odd") return position % 2 === 1;
  if (formula === "even") return position % 2 === 0;
  const [, step = "0", offset = "0"] =
    formula.replace(/\s/g, "").match(/^(\d+)n\+?(-?\d+)?$/) ?? [];
  const a = Number(step);
  const b = Number(offset);
  return a === 0 ? position === b : position >= b && (position - b) % a === 0;
}

function stackGridLayout(wide: boolean): { columns: number; lastSpan: (count: number) => number } {
  const rules = stackGridRules().filter((rule) => wide || !rule.wide);
  let columns = 1;
  for (const rule of rules) {
    const repeat = rule.declaration.match(/grid-template-columns: repeat\((\d+),/);
    if (rule.selector === ".vk-stack-grid" && repeat) columns = Number(repeat[1]);
  }
  return {
    columns,
    lastSpan: (count) => {
      let span = 1;
      for (const rule of rules) {
        const nth = rule.selector.match(/^\.vk-stack-grid > li:last-child:nth-child\(([^)]*)\)$/);
        const column = rule.declaration.match(/grid-column: (auto|span (\d+));/);
        if (!nth || !column || !matchesNth(nth[1] ?? "", count)) continue;
        span = column[1] === "auto" ? 1 : Number(column[2]);
      }
      return span;
    },
  };
}

const MONO_ADVANCE_PX = 12 * 0.6;

function renderedFormatIds(): ReadonlyArray<string> {
  const content = join(process.cwd(), "content/docs");
  const files = readdirSync(content, { recursive: true, encoding: "utf8" }).filter((file) =>
    file.endsWith(".mdx"),
  );
  const ids = files.flatMap((file) => {
    const source = readFileSync(join(content, file), "utf8");
    if (!source.includes("<StackCards")) return [];
    return [...source.matchAll(/formats: \[([^\]]*)\]/g)].flatMap((match) =>
      [...(match[1] ?? "").matchAll(/"([^"]+)"/g)].map((id) => id[1] ?? ""),
    );
  });
  expect(ids.length).toBeGreaterThan(0);
  return ids;
}

function cardTextWidth(gridPx: number, columns: number, chipBeside: boolean): number {
  const card = (gridPx - 12 * (columns - 1)) / columns;
  const frame = 2 + 2 * 14;
  return card - frame - (chipBeside ? 40 + 12 : 0);
}

function render(markup: string): Document {
  return new DOMParser().parseFromString(markup, "text/html");
}

function renderCards(locale: "en" | "de", labelledBy = "stacks"): Document {
  return render(
    renderToStaticMarkup(
      <>
        <h2 id={labelledBy}>Pick your stack</h2>
        <StackCards labelledBy={labelledBy} cards={CARDS} locale={locale} />
      </>,
    ),
  );
}

function accessibleText(element: Element): string {
  const clone = element.cloneNode(true) as Element;
  for (const hidden of clone.querySelectorAll('[aria-hidden="true"]')) hidden.remove();
  return clone.textContent ?? "";
}

describe("StackCards", () => {
  it("is a navigation landmark named by the heading it sits under, one list item per card", () => {
    const doc = renderCards("en");
    const nav = doc.querySelector("nav");
    expect(nav?.hasAttribute("aria-label")).toBe(false);
    const heading = doc.getElementById(nav?.getAttribute("aria-labelledby") ?? "");
    expect(heading?.textContent).toBe("Pick your stack");
    expect(nav?.querySelectorAll("li a")).toHaveLength(CARDS.length);
  });

  it("names each card by its stack, a separator, then its format ids, never by its logo", () => {
    const links = [...renderCards("en").querySelectorAll("a")];
    expect(links.map(accessibleText)).toEqual([
      "React: i18next-json",
      "iOS and macOS: apple-strings, apple-xcstrings",
      "Something else",
    ]);
    for (const link of links) {
      expect(link.querySelector("svg")?.closest('[aria-hidden="true"]')).not.toBeNull();
    }
  });

  it("keeps each format id whole, so a list breaks at its comma and an id only after a hyphen in a very narrow grid", () => {
    const ids = [...renderCards("en").querySelectorAll(".font-mono > span:not(.sr-only)")];
    expect(ids.map((id) => id.textContent)).toEqual([
      "i18next-json",
      "apple-strings",
      "apple-xcstrings",
    ]);
    for (const id of ids) {
      expect(id.className).toBe(FORMAT_ID_CLASS);
      expect(id.querySelector("wbr")).toBeNull();
    }
  });

  it("lets an id wrap only in a grid too narrow to fit the longest rendered id with 15 percent to spare", () => {
    const longest = Math.max(...renderedFormatIds().map((id) => id.length));
    const needed = longest * MONO_ADVANCE_PX * 1.15;
    const wrapBelowRem = Number(FORMAT_ID_CLASS.match(/@max-\[([\d.]+)rem\]/)?.[1]);
    const gridWidths = {
      stacked: wrapBelowRem * 16,
      twoColumnRow: 30 * 16,
      threeColumnRow: 50 * 16,
    };
    expect(cardTextWidth(gridWidths.stacked, 2, false)).toBeGreaterThanOrEqual(needed);
    expect(cardTextWidth(gridWidths.twoColumnRow, 2, true)).toBeGreaterThanOrEqual(needed);
    expect(cardTextWidth(gridWidths.threeColumnRow, 3, true)).toBeGreaterThanOrEqual(needed);
  });

  it("draws each logo once in a sprite and references it from the card", () => {
    const doc = renderCards("en");
    const symbols = [...doc.querySelectorAll("symbol")].map((symbol) => symbol.id);
    expect(symbols).toEqual([
      "vk-stack-icon-stacks-react",
      "vk-stack-icon-stacks-apple",
      "vk-stack-icon-stacks-custom",
    ]);
    const uses = [...doc.querySelectorAll("a use")].map((use) => use.getAttribute("href"));
    expect(uses).toEqual(symbols.map((id) => `#${id}`));
  });

  it("keeps every sprite id unique when two card grids share a page", () => {
    const doc = render(
      renderToStaticMarkup(
        <>
          <StackCards labelledBy="home" cards={CARDS} locale="en" />
          <StackCards labelledBy="page-title" cards={CARDS} locale="en" />
        </>,
      ),
    );
    const ids = [...doc.querySelectorAll("[id]")].map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const nav of doc.querySelectorAll("nav")) {
      const prefix = `#vk-stack-icon-${nav.getAttribute("aria-labelledby")}-`;
      for (const use of nav.querySelectorAll("a use")) {
        expect(use.getAttribute("href")?.startsWith(prefix)).toBe(true);
      }
    }
  });

  it("prefixes the reader's locale on a page link and leaves an in-page anchor alone", () => {
    const hrefs = [...renderCards("de").querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/de/docs/pick-your-stack#react", "#ios-and-macos", "#something-else"]);
  });

  it("uses single-colour logos that follow the text colour, never a brand colour", () => {
    const doc = renderCards("en");
    for (const element of doc.querySelectorAll("symbol path, symbol svg")) {
      const fill = element.getAttribute("fill");
      expect(fill === null || fill === "none" || fill === "currentColor", fill ?? "").toBe(true);
    }
    expect(doc.body.innerHTML).not.toMatch(/dark:/);
  });

  it("lets the last card fill the rest of its row, so neither two nor three columns leave an empty slot", () => {
    expect(renderCards("en").querySelector("ul")?.classList.contains("vk-stack-grid")).toBe(true);
    for (const columns of [2, 3]) {
      const layout = stackGridLayout(columns === 3);
      expect(layout.columns).toBe(columns);
      for (let count = 1; count <= 20; count += 1) {
        const start = (count - 1) % columns;
        expect(start + layout.lastSpan(count), `${count} cards in ${columns} columns`).toBe(
          columns,
        );
      }
    }
  });

  it("drops the card and chip transitions for readers who prefer reduced motion", () => {
    const blocks = [
      ...GLOBAL_CSS.matchAll(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/g),
    ].map((match) => match[1] ?? "");
    const optOut = blocks.find((block) => block.includes(".vk-stack-card,"));
    expect(optOut).toMatch(/\.vk-stack-card,\s*\.vk-stack-card-chip \{\s*transition: none;/);
  });
});
