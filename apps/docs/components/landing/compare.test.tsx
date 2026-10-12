// @vitest-environment jsdom

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
  it("is a captioned table inside a focusable region the caption names", () => {
    const table = root.querySelector("table");
    const caption = table?.querySelector("caption");
    expect(caption?.textContent).toBe(copy.caption);
    const region = table?.closest("section");
    expect(region?.getAttribute("tabindex")).toBe("0");
    expect(region?.getAttribute("aria-labelledby")).toBe(caption?.id);
    expect(region?.className).toContain("overflow-x-auto");
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
