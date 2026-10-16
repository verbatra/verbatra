// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  COMPARE_LAST_CHECKED,
  COMPARE_TOOL_NAMES,
  compareSource,
  SHORT_COLUMNS,
  SHORT_CONCESSION_FOOTNOTES,
  SHORT_ROWS,
  shortCellFootnotes,
  shortTableFootnotes,
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

const copy = en.landing.compare;

let root: HTMLElement;

beforeAll(async () => {
  root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(await Compare());
});

describe("Compare", () => {
  it("is a captioned table inside a focusable region named by its caption", () => {
    const table = root.querySelector("table");
    const caption = table?.querySelector("caption");
    expect(caption?.textContent).toBe(copy.caption);
    const region = table?.closest("section");
    expect(region?.getAttribute("tabindex")).toBe("0");
    expect(region?.hasAttribute("aria-label")).toBe(false);
    expect(root.querySelector(`#${region?.getAttribute("aria-labelledby")}`)).toBe(caption);
    expect(region?.className).toContain("overflow-x-auto");
    expect(region?.className.split(" ")).toContain("relative");
  });

  it("puts the scroll hint before the region and fades its end edge", () => {
    const region = root.querySelector("[data-compare-scroll]");
    const hint = root.querySelector(".vk-compare-hint");
    expect(hint?.textContent).toBe(copy.scrollHint);
    const order = hint && region ? hint.compareDocumentPosition(region) : 0;
    expect(order & Node.DOCUMENT_POSITION_FOLLOWING).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(region?.closest(".vk-compare")?.className).toContain("grid-cols-[minmax(0,1fr)]");
    expect(
      region?.parentElement?.querySelector(".vk-compare-fade")?.getAttribute("aria-hidden"),
    ).toBe("true");
  });

  it("shows the hint and fade only while the table is wider than its column", () => {
    const css = readFileSync(resolve(process.cwd(), "app/global.css"), "utf8");
    const narrow = css.slice(css.indexOf("@container (max-width: 56rem)"));
    expect(css).toMatch(/\.vk-compare-hint,\s*\.vk-compare-fade \{\s*display: none;/);
    expect(narrow).toMatch(/\.vk-compare-hint \{\s*display: block;/);
    expect(narrow).toMatch(/\.vk-compare-fade \{\s*display: block;/);
    expect(root.querySelector("table")?.className).toContain("min-w-[56rem]");
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

  it("scopes the five column headers and the five row headers", () => {
    const columnHeads = Array.from(root.querySelectorAll("thead th"));
    expect(columnHeads.map((th) => th.getAttribute("scope"))).toEqual(Array(6).fill("col"));
    expect(columnHeads.map((th) => th.textContent)).toEqual([
      copy.columns.criterion,
      ...SHORT_COLUMNS.map((column) => copy.columns[column]),
    ]);
    const rowHeads = Array.from(root.querySelectorAll("tbody th"));
    expect(rowHeads.map((th) => th.getAttribute("scope"))).toEqual(Array(5).fill("row"));
    expect(rowHeads.map((th) => th.textContent)).toEqual(
      SHORT_ROWS.map((row) => copy.rows[row].label),
    );
  });

  it("states each cell in text, with no mark glyph, followed by its footnote links", () => {
    expect(root.querySelector("svg")).toBeNull();
    for (const row of SHORT_ROWS) {
      const cells = root.querySelectorAll(`tr[data-row="${row}"] td`);
      SHORT_COLUMNS.forEach((column, index) => {
        const cell = cells[index];
        expect(cell?.querySelector("[data-cell-text]")?.textContent).toBe(
          copy.rows[row][column].replaceAll("`", ""),
        );
        const refs = [...(cell?.querySelectorAll("[data-footnotes] a") ?? [])];
        expect(refs.map((a) => a.textContent)).toEqual(shortCellFootnotes(row, column).map(String));
      });
    }
  });

  it("names every footnote link with its number and tool and points it at a listed source", () => {
    for (const ref of root.querySelectorAll<HTMLAnchorElement>("[data-footnotes] a")) {
      const label = ref.getAttribute("aria-label") ?? "";
      expect(label).toContain(ref.textContent ?? "");
      const target = root.querySelector(ref.getAttribute("href") ?? "#none");
      expect(target, ref.getAttribute("href") ?? "").not.toBeNull();
      if (ref.textContent === "M") {
        expect(label).toBe(copy.noteRef);
        expect(target?.textContent).toContain(copy.manualNote);
      } else {
        const number = Number(ref.textContent);
        expect(label).toBe(`Source ${number}, ${COMPARE_TOOL_NAMES[compareSource(number).tool]}`);
        expect(target?.getAttribute("value")).toBe(String(number));
      }
    }
  });

  it("lists each cited source once, under its shared number, with every link", () => {
    const items = [...root.querySelectorAll<HTMLLIElement>("ol li[id^='compare-source-']")];
    expect(items.map((li) => Number(li.getAttribute("value")))).toEqual([...shortTableFootnotes()]);
    for (const item of items) {
      const source = compareSource(Number(item.getAttribute("value")));
      expect(item.textContent).toContain(COMPARE_TOOL_NAMES[source.tool]);
      expect(item.querySelectorAll("a").length).toBe(source.urls.length);
    }
    const own = items.find((li) => li.getAttribute("value") === "5");
    expect(own?.querySelector("a")?.getAttribute("href")).toBe(
      "/de/docs/providers#keys-kommen-aus-der-umgebung",
    );
  });

  it("dates the check, frames the comparison fairly and admits what hosted platforms add", () => {
    const time = root.querySelector("[data-last-checked] time");
    expect(time?.getAttribute("datetime")).toBe(COMPARE_LAST_CHECKED);
    expect(root.querySelector("[data-fairness]")?.textContent).toBe(copy.fairness);
    const concession = root.querySelector("[data-concession]");
    expect(concession?.textContent).toContain(copy.concession);
    expect([...(concession?.querySelectorAll("a") ?? [])].map((a) => a.textContent)).toEqual(
      SHORT_CONCESSION_FOOTNOTES.map(String),
    );
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
