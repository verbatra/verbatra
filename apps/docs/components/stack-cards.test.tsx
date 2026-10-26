// @vitest-environment jsdom

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FORMAT_ID_CLASS, type StackCard, StackCards } from "./stack-cards";
import { FILE_GLYPH_LABELS } from "./stack-icons";

const CARDS: ReadonlyArray<StackCard> = [
  {
    label: "React",
    icon: "web",
    mark: "react",
    formats: ["i18next-json"],
    href: "/docs/pick-your-stack#react",
  },
  {
    label: "iOS and macOS",
    icon: "mobile",
    mark: "fontawesomeApple",
    formats: ["apple-strings", "apple-xcstrings"],
    href: "#ios-and-macos",
  },
  { label: "Something else", icon: "custom", formats: [], href: "#something-else" },
];

const GLOBAL_CSS = readFileSync(join(process.cwd(), "app/global.css"), "utf8");

function closingBrace(css: string, open: number): number {
  let depth = 0;
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    if (css[index] === "}") depth -= 1;
    if (depth === 0) return index;
  }
  return css.length;
}

function containerColumns(): ReadonlyArray<{ minRem: number; columns: number }> {
  const css = GLOBAL_CSS.replace(/\s+/g, " ");
  const found = [{ minRem: 0, columns: 1 }];
  for (const match of css.matchAll(/@container \(min-width: ([\d.]+)rem\) \{/g)) {
    const open = (match.index ?? 0) + match[0].length - 1;
    const body = css.slice(open, closingBrace(css, open));
    const repeat = /\.vk-stack-grid \{ grid-template-columns: repeat\((\d+),/.exec(body);
    if (repeat) found.push({ minRem: Number(match[1]), columns: Number(repeat[1]) });
  }
  return found;
}

function cssRule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\}|\\n)\\s*${escaped} \\{([^}]*)\\}`).exec(GLOBAL_CSS)?.[1] ?? "";
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

function cardTextWidth(gridPx: number, columns: number): number {
  const card = (gridPx - 24 * (columns - 1)) / columns;
  return card - 56 - 24;
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

  it("puts a card's badge inside the name link, beside the name, so it adds no line of its own", () => {
    const doc = render(
      renderToStaticMarkup(
        <StackCards
          labelledBy="stacks"
          locale="en"
          cards={[
            {
              label: "React",
              icon: "web",
              formats: ["i18next-json"],
              href: "/docs/quickstart/react",
              badge: "Quickstart",
            },
            ...CARDS.slice(1),
          ]}
        />,
      ),
    );
    const links = [...doc.querySelectorAll("a")];
    const pill = links[0]?.querySelector(".vk-pill");
    expect(pill?.textContent).toBe(", Quickstart");
    expect(pill?.classList.contains("vk-stack-card-badge")).toBe(true);
    expect(pill?.parentElement).toBe(links[0]);
    expect(links[0]?.parentElement?.classList.contains("vk-stack-card-name")).toBe(true);
    expect(accessibleText(links[0] as Element)).toBe("React, Quickstart");
    expect(cssRule(".vk-stack-card-link")).toContain("display: inline-flex;");
    expect(cssRule(".vk-pill.vk-stack-card-badge")).toContain("white-space: normal;");
    expect(cssRule(".vk-pill.vk-stack-card-badge")).toContain("max-width: 100%;");
    expect(links.slice(1).some((link) => link.querySelector(".vk-pill") !== null)).toBe(false);
  });

  it("names each link by its stack alone, with the format ids and glyph outside it", () => {
    const doc = renderCards("en");
    const links = [...doc.querySelectorAll("a")];
    expect(links.map(accessibleText)).toEqual(["React", "iOS and macOS", "Something else"]);
    const items = [...doc.querySelectorAll("li")];
    expect(items.map(accessibleText)).toEqual([
      "Reacti18next-json",
      "iOS and macOSapple-strings, apple-xcstrings",
      "Something else",
    ]);
    for (const item of items) {
      expect(item.querySelector("a svg")).toBeNull();
      expect(item.querySelector(".vk-stack-card-chip")?.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("gives every card exactly one link, with the chip and the chevron hidden and outside it", () => {
    const items = [...renderCards("en").querySelectorAll("li")];
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      const links = item.querySelectorAll("a");
      expect(links).toHaveLength(1);
      const link = links[0] as Element;
      for (const selector of [".vk-stack-card-chip", ".vk-stack-card-chevron"]) {
        const part = item.querySelector(selector);
        expect(part?.getAttribute("aria-hidden"), selector).toBe("true");
        expect(link.contains(part), selector).toBe(false);
      }
    }
  });

  it("puts the glyph after the text in the DOM and shows it first through a reversed row", () => {
    const item = renderCards("en").querySelector("li");
    expect([...(item?.children ?? [])].map((child) => child.className)).toEqual([
      "vk-stack-card-text",
      "vk-stack-card-chip",
    ]);
    expect(cssRule(".vk-stack-card")).toContain("flex-direction: row-reverse;");
    const chip = cssRule(".vk-stack-card-chip");
    expect(chip).toContain("width: var(--stack-chip-size);");
    expect(chip).toContain("border-radius: var(--radius-full);");
    expect(GLOBAL_CSS).toMatch(/--stack-chip-size: 3\.5rem;/);
  });

  it("stretches the one link over the whole card, which keeps no border or background of its own", () => {
    expect(cssRule(".vk-stack-card")).toContain("position: relative;");
    const stretch = cssRule(".vk-stack-card-link::before");
    expect(stretch).toContain("position: absolute;");
    expect(stretch).toContain("inset: calc(-1 * var(--stack-card-hit-outset));");
    expect(cssRule(".vk-stack-card-link:focus-visible::before")).toContain(
      "outline: 2px solid var(--focus-ring);",
    );
    expect(cssRule(".vk-stack-card")).not.toMatch(/border|background/);
  });

  it("fades the chevron in on hover and on keyboard focus only, and changes nothing else", () => {
    const chevron = renderCards("en").querySelector("li .vk-stack-card-chevron");
    expect(chevron?.getAttribute("aria-hidden")).toBe("true");
    expect(cssRule(".vk-stack-card-chevron")).toContain("opacity: 0;");
    const css = GLOBAL_CSS.replace(/\s+/g, " ");
    expect(css).toContain(
      ".vk-stack-card:hover .vk-stack-card-chevron, .vk-stack-card:has(.vk-stack-card-link:focus-visible) .vk-stack-card-chevron { opacity: 1; }",
    );
    const hoverRules = [...css.matchAll(/([^{}]*\.vk-stack-card[^{}]*:(?:hover|focus)[^{}]*)\{/g)];
    expect(hoverRules.map((match) => match[1]?.trim())).toEqual([
      ".vk-stack-card-link:focus-visible::before",
      ".vk-stack-card:hover .vk-stack-card-chevron, .vk-stack-card:has(.vk-stack-card-link:focus-visible) .vk-stack-card-chevron",
    ]);
  });

  it("renders a description only when the card has one", () => {
    const doc = render(
      renderToStaticMarkup(
        <StackCards
          labelledBy="stacks"
          locale="en"
          cards={[
            { ...CARDS[0], description: "Translate i18next JSON." } as StackCard,
            ...CARDS.slice(1),
          ]}
        />,
      ),
    );
    const descriptions = [...doc.querySelectorAll(".vk-stack-card-description")];
    expect(descriptions.map((element) => element.textContent)).toEqual(["Translate i18next JSON."]);
  });

  it("keeps each format id whole, so a list breaks at its comma and an id only after a hyphen in a very narrow grid", () => {
    const ids = [...renderCards("en").querySelectorAll(".vk-stack-card-formats > span")];
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
    const [, two, three] = containerColumns();
    expect(cardTextWidth(wrapBelowRem * 16, 1)).toBeGreaterThanOrEqual(needed);
    expect(cardTextWidth((two?.minRem ?? 0) * 16, 2)).toBeGreaterThanOrEqual(needed);
    expect(cardTextWidth((three?.minRem ?? 0) * 16, 3)).toBeGreaterThanOrEqual(needed);
  });

  it("draws a generic glyph only for a card with no brand mark, once, in a sprite", () => {
    const doc = renderCards("en");
    const glyphs = [...doc.querySelectorAll("symbol")]
      .map((symbol) => symbol.id)
      .filter((id) => id.startsWith("vk-stack-icon-"));
    expect(glyphs).toEqual(["vk-stack-icon-stacks-custom"]);
    const items = [...doc.querySelectorAll("li")];
    const hrefs = items.map((item) =>
      item.querySelector(".vk-stack-card-chip use")?.getAttribute("href"),
    );
    expect(hrefs).toEqual([
      "#vk-stack-mark-stacks-react",
      "#vk-stack-mark-stacks-fontawesomeApple",
      "#vk-stack-icon-stacks-custom",
    ]);
  });

  it("draws a brand mark as a currentColor fill from the shared sprite, never an image", () => {
    const doc = renderCards("en");
    const marks = [...doc.querySelectorAll("symbol")].filter((symbol) =>
      symbol.id.startsWith("vk-stack-mark-"),
    );
    expect(marks.map((symbol) => symbol.id)).toEqual([
      "vk-stack-mark-stacks-react",
      "vk-stack-mark-stacks-fontawesomeApple",
    ]);
    for (const symbol of marks) {
      const path = symbol.querySelector("path");
      expect(path?.getAttribute("fill")).toBe("currentColor");
      expect(path?.getAttribute("stroke")).toBeNull();
    }
    expect(doc.querySelector("img, image")).toBeNull();
    expect(doc.body.innerHTML).not.toMatch(/#[0-9a-f]{6}|rgb\(|hsl\(/i);
  });

  it("scales a mark with its own viewBox to fit the square chip, so a tall or wide drawing keeps its proportions", () => {
    const doc = render(
      renderToStaticMarkup(
        <StackCards
          labelledBy="stacks"
          locale="de"
          cards={[
            {
              label: "Vue",
              icon: "web",
              mark: "fontawesomeVuejs",
              formats: ["vue-i18n-json"],
              href: "#vue",
            },
            {
              label: ".NET",
              icon: "server",
              mark: "deviconDotnet",
              formats: ["resx"],
              href: "#net",
            },
          ]}
        />,
      ),
    );
    const viewBoxes = [...doc.querySelectorAll("symbol")].map((symbol) =>
      symbol.getAttribute("viewBox"),
    );
    expect(viewBoxes).toEqual(["0 0 448 512", "0 0 128 128"]);
    const chips = [...doc.querySelectorAll(".vk-stack-card-chip")];
    for (const chip of chips) {
      expect(chip.getAttribute("aria-hidden")).toBe("true");
      expect(chip.textContent).toBe("");
      expect(chip.querySelector("img")).toBeNull();
    }
    expect([...doc.querySelectorAll("a")].map(accessibleText)).toEqual(["Vue", ".NET"]);
  });

  it("gives every stack with a brand logo a mark from a free-licensed icon set, the same marks in every locale", () => {
    const content = join(process.cwd(), "content/docs");
    const files = readdirSync(content, { recursive: true, encoding: "utf8" }).filter(
      (file) =>
        file.endsWith(".mdx") && readFileSync(join(content, file), "utf8").includes("<StackCards"),
    );
    const marks = (file: string) =>
      [...readFileSync(join(content, file), "utf8").matchAll(/mark: "([^"]+)"/g)].map((m) => m[1]);
    for (const file of files) {
      const source = readFileSync(join(content, file), "utf8");
      const expected = file.includes("pick-your-stack")
        ? [
            "react",
            "deviconNextjs",
            "fontawesomeVuejs",
            "angular",
            "fontawesomeFlutter",
            "android",
            "fontawesomeApple",
            "deviconSpring",
            "deviconDotnet",
          ]
        : [
            "react",
            "deviconNextjs",
            "fontawesomeVuejs",
            "deviconNuxt",
            "angular",
            "fontawesomeFlutter",
            "fontawesomeApple",
            "android",
            "deviconSpring",
            "deviconDotnet",
          ];
      expect(marks(file).toSorted(), file).toEqual(expected.toSorted());
      expect(source).not.toMatch(/\btext: "/);
    }
  });

  it("draws a file glyph larger than a brand mark, so its thinner ink balances the logos", () => {
    const doc = render(
      renderToStaticMarkup(
        <StackCards
          labelledBy="stacks"
          locale="en"
          cards={[
            { label: "INI", icon: "ini", formats: ["ini"], href: "#ini" },
            { label: "Custom", icon: "custom", formats: [], href: "#custom" },
            CARDS[0] as StackCard,
          ]}
        />,
      ),
    );
    const sizes = [...doc.querySelectorAll(".vk-stack-card-chip > svg")].map((svg) =>
      svg.getAttribute("width"),
    );
    expect(sizes).toEqual(["40", "28", "28"]);
  });

  it("labels each file glyph with its format extension, drawn as page-font text in the text colour", () => {
    const doc = render(
      renderToStaticMarkup(
        <StackCards
          labelledBy="stacks"
          locale="en"
          cards={(["po", "xliff", "ini", "yaml", "json"] as const).map((icon) => ({
            label: icon,
            icon,
            formats: [],
            href: `#${icon}`,
          }))}
        />,
      ),
    );
    const labels = [...doc.querySelectorAll("symbol text")].map((text) => text.textContent);
    expect(labels).toEqual([".po", "XLF", "INI", "YAML", "JSON"]);
    for (const text of doc.querySelectorAll("symbol text")) {
      expect(text.getAttribute("fill")).toBe("currentColor");
      expect(text.getAttribute("font-family")).toContain("var(--font-mono)");
      expect(text.getAttribute("textLength")).not.toBeNull();
    }
    expect(Object.keys(FILE_GLYPH_LABELS).toSorted()).toEqual([
      "ini",
      "json",
      "po",
      "xliff",
      "yaml",
    ]);
    expect(doc.querySelectorAll("li > span > svg[aria-hidden='true']")).toHaveLength(5);
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
      const label = nav.getAttribute("aria-labelledby");
      for (const use of nav.querySelectorAll("li use")) {
        const href = use.getAttribute("href") ?? "";
        expect(
          href.startsWith(`#vk-stack-icon-${label}-`) ||
            href.startsWith(`#vk-stack-mark-${label}-`),
        ).toBe(true);
      }
    }
  });

  it("prefixes the reader's locale on a page link and leaves an in-page anchor alone", () => {
    const hrefs = [...renderCards("de").querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/de/docs/pick-your-stack#react", "#ios-and-macos", "#something-else"]);
  });

  it("draws outline glyphs in the text colour and never a hand-drawn lookalike of a logo", () => {
    const doc = renderCards("en");
    const glyphs = [...doc.querySelectorAll("symbol")].filter((symbol) =>
      symbol.id.startsWith("vk-stack-icon-"),
    );
    expect(glyphs.length).toBe(1);
    for (const symbol of glyphs) {
      const path = symbol.querySelector("path");
      expect(path?.getAttribute("fill")).toBe("none");
      expect(path?.getAttribute("stroke")).toBe("currentColor");
    }
    expect(doc.body.innerHTML).not.toMatch(/dark:/);
  });

  it("draws no stack mark from Simple Icons, whose CC0 data does not clear a brand's own logo terms", () => {
    const content = join(process.cwd(), "content/docs");
    const files = readdirSync(content, { recursive: true, encoding: "utf8" }).filter(
      (file) =>
        file.endsWith(".mdx") && readFileSync(join(content, file), "utf8").includes("<StackCards"),
    );
    expect(files).toHaveLength(8);
    for (const file of files) {
      const source = readFileSync(join(content, file), "utf8");
      expect(source).not.toMatch(/mark: "(?:spring|flutter|nextdotjs|apple|yaml|vue|nuxt)"/);
      expect(source).toMatch(/label: "YAML", icon: "yaml", formats/);
    }
  });

  it("lays the cards out in one, two, then three columns, leaving a short last row ragged", () => {
    expect(renderCards("en").querySelector("ul")?.classList.contains("vk-stack-grid")).toBe(true);
    expect(containerColumns().map((step) => step.columns)).toEqual([1, 2, 3]);
    const grid = cssRule(".vk-stack-grid");
    expect(grid).toContain("grid-template-columns: minmax(0, 1fr);");
    expect(grid).toContain("column-gap: var(--stack-grid-column-gap);");
    expect(grid).toContain("row-gap: var(--stack-grid-row-gap);");
    expect(GLOBAL_CSS).not.toMatch(/\.vk-stack-grid > li:last-child/);
  });

  it("drops the chevron fade for readers who prefer reduced motion", () => {
    const blocks = [
      ...GLOBAL_CSS.matchAll(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/g),
    ].map((match) => match[1] ?? "");
    const optOut = blocks.find((block) => block.includes(".vk-stack-card-chevron,"));
    expect(optOut).toMatch(/\.vk-stack-card-chevron,\s*\.vk-home-tab \{\s*transition: none;/);
  });
});
