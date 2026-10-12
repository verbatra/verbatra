// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { COMPARE_COLUMNS, COMPARE_ROWS } from "@/lib/landing-compare";
import en from "@/messages/en.json";

vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const { default: messages } = await import("@/messages/en.json");
  return {
    getTranslations: async (namespace: string) =>
      createTranslator({ locale: "en", messages, namespace: namespace as never }),
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
  it("is a captioned table inside a focusable, named region that scrolls sideways", () => {
    const table = root.querySelector("table");
    const caption = table?.querySelector("caption");
    expect(caption?.textContent).toBe(copy.caption);
    const region = table?.closest("section");
    expect(region?.getAttribute("tabindex")).toBe("0");
    expect(region?.hasAttribute("aria-label")).toBe(false);
    expect(root.querySelector(`#${region?.getAttribute("aria-labelledby")}`)).toBe(caption);
    expect(region?.className).toContain("overflow-x-auto");
  });

  it("caps the region at its column, puts the scroll hint before it and fades its end edge", () => {
    const region = root.querySelector("[data-compare-scroll]");
    const hint = root.querySelector(".vk-compare-hint");
    expect(hint?.textContent).toBe(copy.scrollHint);
    expect(region?.hasAttribute("aria-describedby")).toBe(false);
    const order = hint && region ? hint.compareDocumentPosition(region) : 0;
    expect(order & Node.DOCUMENT_POSITION_FOLLOWING).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(root.querySelector(".vk-compare-frame")).toBeNull();
    expect(region?.parentElement?.className).toContain("min-w-0");
    expect(region?.closest(".vk-compare")?.className).toContain("grid-cols-[minmax(0,1fr)]");
    const fade = region?.parentElement?.querySelector(".vk-compare-fade");
    expect(fade?.getAttribute("aria-hidden")).toBe("true");
  });

  it("keeps the row headers pinned while the value columns scroll", () => {
    for (const th of root.querySelectorAll("tbody th, thead th:first-child")) {
      expect(th.className).toContain("sticky");
      expect(th.className).toContain("vk-compare-sticky");
    }
  });

  it("shows the hint and fade only while the table is wider than its column", () => {
    const css = readFileSync(resolve(process.cwd(), "app/global.css"), "utf8");
    const narrow = css.slice(css.indexOf("@container (max-width: 46rem)"));
    expect(css).toMatch(/\.vk-compare-hint,\s*\.vk-compare-fade \{\s*display: none;/);
    expect(narrow).toMatch(/\.vk-compare-hint \{\s*display: block;/);
    expect(narrow).toMatch(/\.vk-compare-fade \{\s*display: block;/);
    expect(root.querySelector("table")?.className).toContain("min-w-[46rem]");
  });

  it("drops the end fade where no scroll timeline can hide it, and shades the scroll edge instead", () => {
    const css = readFileSync(resolve(process.cwd(), "app/global.css"), "utf8");
    const fallback = css.slice(css.indexOf("@supports not (animation-timeline: scroll())"));
    expect(fallback).toMatch(/^@supports not[^{]*\{\s*\.vk-compare-fade \{\s*display: none;/);
    expect(fallback).toMatch(/\.vk-compare-scroll \{\s*background:[^}]*local[^}]*scroll/);
  });

  it("positions its scroll region, so the visually hidden labels scroll inside it instead of widening the page", () => {
    const region = root.querySelector("table")?.closest("section");
    expect(region?.className.split(" ")).toContain("relative");
    expect(region?.querySelector(".sr-only")).not.toBeNull();
  });

  it("scopes every column header and every row header", () => {
    const columnHeads = Array.from(root.querySelectorAll("thead th"));
    expect(columnHeads.map((th) => th.getAttribute("scope"))).toEqual(
      Array(COMPARE_COLUMNS.length + 1).fill("col"),
    );
    expect(columnHeads.map((th) => th.textContent)).toEqual([
      copy.columns.aspect,
      ...COMPARE_COLUMNS.map((column) => copy.columns[column]),
    ]);
    const rowHeads = Array.from(root.querySelectorAll("tbody th"));
    expect(rowHeads.map((th) => th.getAttribute("scope"))).toEqual(
      Array(COMPARE_ROWS.length).fill("row"),
    );
    expect(rowHeads.map((th) => th.textContent)).toEqual(
      COMPARE_ROWS.map((row) => copy.rows[row.id].label),
    );
  });

  it("gives every mark a text label and a distinct shape, never color alone", () => {
    for (const row of COMPARE_ROWS) {
      const cells = root.querySelectorAll(
        `tbody tr:nth-child(${COMPARE_ROWS.indexOf(row) + 1}) td`,
      );
      COMPARE_COLUMNS.forEach((column, index) => {
        const cell = cells[index];
        const mark = row.marks?.[column];
        const text = copy.rows[row.id][column].replaceAll("`", "");
        if (mark) {
          expect(cell?.getAttribute("data-mark")).toBe(mark);
          expect(cell?.querySelector(".sr-only")?.textContent).toBe(`${copy.marks[mark]}: `);
          const glyph = cell?.querySelector("svg");
          expect(glyph?.getAttribute("aria-hidden")).toBe("true");
          expect(glyph?.getAttribute("data-mark-glyph")).toBe(mark);
          expect(cell?.textContent).toBe(`${copy.marks[mark]}: ${text}`);
        } else {
          expect(cell?.querySelector("svg")).toBeNull();
          expect(cell?.textContent).toBe(text);
        }
      });
    }
  });

  it("draws each mark with its own shape", () => {
    const shapes = new Map<string, string>();
    for (const glyph of root.querySelectorAll("svg[data-mark-glyph]")) {
      shapes.set(glyph.getAttribute("data-mark-glyph") ?? "", glyph.innerHTML);
    }
    expect(new Set(shapes.values()).size).toBe(shapes.size);
    expect([...shapes.keys()].sort()).toEqual(["no", "partial", "yes"]);
  });

  it("sets commands in a cell in code", () => {
    expect(Array.from(root.querySelectorAll("td code")).map((c) => c.textContent)).toContain(
      "verbatra check",
    );
  });

  it("says the hosted TMS column describes the category", () => {
    expect(root.textContent).toContain(copy.note);
  });
});
