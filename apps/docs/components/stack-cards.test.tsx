// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { type StackCard, StackCards } from "./stack-cards";

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
    const css = GLOBAL_CSS.replace(/\s+/g, " ");
    expect(css).toContain(
      ".vk-stack-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .vk-stack-grid > li:last-child:nth-child(odd) { grid-column: span 2; }",
    );
    const threeColumns = css.match(/@container \(min-width: 50rem\) \{(.*?)\} \}/)?.[1] ?? "";
    expect(threeColumns).toContain("repeat(3, minmax(0, 1fr))");
    expect(threeColumns).toContain("li:last-child:nth-child(3n + 2) { grid-column: span 2;");
    expect(threeColumns).toContain("li:last-child:nth-child(3n + 1) { grid-column: span 3;");
  });

  it("drops the card and chip transitions for readers who prefer reduced motion", () => {
    const blocks = [
      ...GLOBAL_CSS.matchAll(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/g),
    ].map((match) => match[1] ?? "");
    const optOut = blocks.find((block) => block.includes(".vk-stack-card,"));
    expect(optOut).toMatch(/\.vk-stack-card,\s*\.vk-stack-card-chip \{\s*transition: none;/);
  });
});
