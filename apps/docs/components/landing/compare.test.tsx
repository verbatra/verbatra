// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  COMPARE_LAST_CHECKED,
  COMPARE_SOURCE_COUNT,
  COMPARE_TOOL_NAMES,
  CONCESSION_FOOTNOTES,
  compareSource,
  SHORT_COLUMNS,
  SHORT_ROWS,
  shortCellFootnotes,
  shortCellHasText,
  shortCellIsYes,
} from "@/lib/landing-compare";
import en from "@/messages/en.json";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    prefetch: _prefetch,
    ...rest
  }: ComponentProps<"a"> & { href: string; prefetch?: unknown }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const { default: messages } = await import("@/messages/en.json");
  return {
    getTranslations: async (namespace: string) =>
      createTranslator({ locale: "en", messages, namespace: namespace as never }),
    getLocale: async () => "de",
  };
});

const { Compare } = await import("./compare");
const { TextWithRefs } = await import("./compare-table");

const copy = en.landing.compare;

let root: HTMLElement;

beforeAll(async () => {
  root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(await Compare());
});

function cellText(cell: Element | undefined): string | undefined {
  const text = cell?.querySelector("[data-cell-text]")?.cloneNode(true) as Element | undefined;
  for (const refs of text?.querySelectorAll("[data-footnotes]") ?? []) refs.remove();
  return text?.textContent?.replace(/\u00a0$/, "");
}

describe("Compare", () => {
  it("is a captioned table inside a focusable region named by its caption", () => {
    const table = root.querySelector("table");
    const caption = table?.querySelector("caption");
    expect(caption?.textContent).toBe(copy.caption);
    const region = table?.closest("section");
    expect(region?.getAttribute("tabindex")).toBe("0");
    expect(region?.hasAttribute("aria-label")).toBe(false);
    expect(root.querySelector(`#${region?.getAttribute("aria-labelledby")}`)).toBe(caption);
  });

  it("puts the scroll hint before the region and fades its end edge", () => {
    const region = root.querySelector("[data-compare-scroll]");
    const hint = root.querySelector(".vk-compare-hint");
    expect(hint?.textContent).toBe(copy.scrollHint);
    const order = hint && region ? hint.compareDocumentPosition(region) : 0;
    expect(order & Node.DOCUMENT_POSITION_FOLLOWING).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(
      region?.parentElement?.querySelector(".vk-compare-fade")?.getAttribute("aria-hidden"),
    ).toBe("true");
  });

  it("shows the hint and fade only while the table is wider than its column", () => {
    const css = readFileSync(resolve(process.cwd(), "app/global.css"), "utf8");
    const narrow = css.slice(css.indexOf("@container (max-width: 40rem)"));
    expect(css).toMatch(/\.vk-compare-hint,\s*\.vk-compare-fade \{\s*display: none;/);
    expect(narrow).toMatch(/\.vk-compare-hint \{\s*display: block;/);
    expect(narrow).toMatch(/\.vk-compare-fade \{\s*display: block;/);
    expect(root.querySelector("table")?.className).toContain("min-w-[40rem]");
  });

  it("drops the end fade where no scroll timeline can hide it, and shades the scroll edge instead", () => {
    const css = readFileSync(resolve(process.cwd(), "app/global.css"), "utf8");
    const fallback = css.slice(css.indexOf("@supports not (animation-timeline: scroll())"));
    expect(fallback).toMatch(/^@supports not[^{]*\{\s*\.vk-compare-fade \{\s*display: none;/);
    expect(fallback).toMatch(/\.vk-compare-scroll \{\s*background:[^}]*local[^}]*scroll/);
  });

  it("pins the first column while the value columns scroll", () => {
    for (const th of root.querySelectorAll("tbody th, thead th:first-child")) {
      expect(th.className).toContain("sticky");
      expect(th.className).toContain("vk-compare-sticky");
    }
  });

  it("scopes at most four value columns and six row headers", () => {
    expect(SHORT_COLUMNS.length).toBeLessThanOrEqual(4);
    expect(SHORT_ROWS.length).toBeLessThanOrEqual(6);
    expect(SHORT_COLUMNS[0]).toBe("verbatra");
    const columnHeads = Array.from(root.querySelectorAll("thead th"));
    expect(columnHeads.map((th) => th.getAttribute("scope"))).toEqual(
      Array(SHORT_COLUMNS.length + 1).fill("col"),
    );
    expect(columnHeads.map((th) => th.textContent)).toEqual([
      copy.columns.criterion,
      ...SHORT_COLUMNS.map((column) => copy.columns[column]),
    ]);
    const rowHeads = Array.from(root.querySelectorAll("tbody th"));
    expect(rowHeads.map((th) => th.getAttribute("scope"))).toEqual(
      Array(SHORT_ROWS.length).fill("row"),
    );
    expect(rowHeads.map((th) => th.textContent)).toEqual(
      SHORT_ROWS.map((row) => copy.rows[row].label),
    );
  });

  it("marks a plain yes with a check that reads Yes, states the rest in words and footnotes every cell", () => {
    for (const row of SHORT_ROWS) {
      const cells = root.querySelectorAll(`tr[data-row="${row}"] td`);
      SHORT_COLUMNS.forEach((column, index) => {
        const cell = cells[index];
        const mark = cell?.querySelector("[data-mark='yes']");
        const brief = (copy.brief[row] as Partial<Record<string, string>>)[column];
        if (shortCellIsYes(row, column)) {
          expect(mark?.querySelector("svg")?.getAttribute("aria-hidden"), `${row} ${column}`).toBe(
            "true",
          );
          expect(mark?.querySelector(".sr-only")?.textContent).toBe(copy.marks.yes);
        } else {
          expect(mark, `${row} ${column}`).toBeNull();
        }
        expect(brief !== undefined, `${row} ${column}`).toBe(shortCellHasText(row, column));
        const text = cellText(cell)?.replace(copy.marks.yes, "");
        expect(text, `${row} ${column}`).toBe((brief ?? "").replaceAll("`", ""));
        const refs = [...(cell?.querySelectorAll("[data-footnotes] a") ?? [])];
        expect(refs.map((a) => a.textContent)).toEqual(shortCellFootnotes(row, column).map(String));
      });
    }
  });

  it("holds a brief message for exactly the cells that show words", () => {
    expect(Object.keys(copy.brief)).toEqual([...SHORT_ROWS]);
    for (const row of SHORT_ROWS) {
      expect(Object.keys(copy.brief[row]), row).toEqual(
        SHORT_COLUMNS.filter((column) => shortCellHasText(row, column)),
      );
    }
  });

  it("checks every Verbatra cell and never draws a cross", () => {
    for (const row of SHORT_ROWS) expect(shortCellIsYes(row, "verbatra"), row).toBe(true);
    expect(root.querySelector("[data-mark]:not([data-mark='yes'])")).toBeNull();
  });

  it("names every footnote link with its number and tool and points it at the source on /compare", () => {
    const refs = [...root.querySelectorAll<HTMLAnchorElement>("[data-footnotes] a")];
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      const label = ref.getAttribute("aria-label") ?? "";
      const href = ref.getAttribute("href") ?? "";
      if (ref.textContent === "M") {
        expect(label).toBe(copy.noteRef);
        expect(href).toBe("/de/compare#source-m");
      } else {
        const number = Number(ref.textContent);
        expect(number).toBeGreaterThan(0);
        expect(number).toBeLessThanOrEqual(COMPARE_SOURCE_COUNT);
        expect(label).toBe(`Source ${number}, ${COMPARE_TOOL_NAMES[compareSource(number).tool]}`);
        expect(href).toBe(`/de/compare#source-${number}`);
      }
    }
  });

  it("leaves the source list to /compare", () => {
    expect(root.querySelector("ol")).toBeNull();
    expect(root.querySelector("[id^='source-']")).toBeNull();
    expect(root.textContent).not.toContain(copy.sources);
  });

  it("glues each cell's last word to its footnote links", () => {
    for (const refs of root.querySelectorAll("td [data-footnotes]")) {
      expect(refs.previousSibling?.textContent?.endsWith("\u00a0")).toBe(true);
      expect(refs.className).toContain("flex-nowrap");
      expect(refs.parentElement?.className).toContain("whitespace-nowrap");
      expect(refs.parentElement?.textContent?.split(/\s/)[0]).not.toBe("");
    }
  });

  it("keeps a closing quote or other punctuation-only tail with the word before it", () => {
    for (const [text, glued] of [
      ["limited to \u00ab Untranslated strings \u00bb", "strings \u00bb"],
      ["ends in a word", "word"],
      ["a note (see M )", "M )"],
    ] as const) {
      const holder = document.createElement("div");
      holder.innerHTML = renderToStaticMarkup(<TextWithRefs text={text} refs={<sup>1</sup>} />);
      expect(holder.querySelector(".whitespace-nowrap")?.textContent).toBe(`${glued}1`);
    }
  });

  it("opens with a split head that carries a lead", () => {
    const head = root.querySelector(".vk-section-head");
    expect(head?.getAttribute("data-layout")).toBe("split");
    expect(head?.getAttribute("data-align")).toBe("start");
    expect(head?.querySelector(".vk-section-head-lead")?.textContent).toBe(copy.lead);
  });

  it("dates the check, admits what hosted platforms add and leaves the fairness note to /compare", () => {
    const time = root.querySelector("[data-last-checked] time");
    expect(time?.getAttribute("datetime")).toBe(COMPARE_LAST_CHECKED);
    expect(root.querySelector("[data-fairness]")).toBeNull();
    const concession = root.querySelector("[data-concession]");
    expect(concession?.textContent).toContain(copy.concession);
    const refs = [...(concession?.querySelectorAll("a") ?? [])].map((a) => Number(a.textContent));
    expect(refs).toEqual(CONCESSION_FOOTNOTES.map(Number));
    expect(refs).toEqual(refs.toSorted((a, b) => a - b));
  });

  it("keeps the prose outside the heading, the table and the phone scroll hint to forty words", () => {
    const section = root.querySelector("section#compare")?.cloneNode(true);
    if (!(section instanceof Element)) throw new Error("no comparison section");
    for (const skipped of section.querySelectorAll("h2, table, .vk-compare-hint, [data-footnotes]"))
      skipped.remove();
    const words = (section.textContent ?? "")
      .split(/\s+/)
      .filter((word) => /[\p{L}\p{N}]/u.test(word));
    expect(words.length).toBeGreaterThan(0);
    expect(words.length).toBeLessThanOrEqual(40);
  });

  it("links the full comparison page in the visitor's locale", () => {
    const link = [...root.querySelectorAll("a")].find((a) => a.textContent === copy.fullLink);
    expect(link?.getAttribute("href")).toBe("/de/compare");
  });

  it("sets commands in a cell in code", () => {
    expect(Array.from(root.querySelectorAll("td code")).map((c) => c.textContent)).toContain(
      "check",
    );
  });
});
