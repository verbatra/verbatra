// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  COMPARISON_ROWS,
  COMPARISON_TOOLS,
  type ComparisonTool,
  comparisonCell,
} from "@/lib/landing-comparison";
import { docsStylesheetRules, rulesFor } from "@/lib/stylesheet-rules";
import en from "@/messages/en.json";

const rendering = vi.hoisted(() => ({ locale: "en" }));

vi.mock("next-intl/server", async () => {
  const { catalogIntlServerAt } = await import("@/test-support/catalog-intl");
  return catalogIntlServerAt(() => rendering.locale);
});

const { Comparison } = await import("./comparison");

async function render(): Promise<Document> {
  return new DOMParser().parseFromString(renderToStaticMarkup(await Comparison()), "text/html");
}

const copy = en.landing.comparison;

describe("the landing comparison section", () => {
  it("is the compare section, named by its heading, with a split head and no eyebrow", async () => {
    const doc = await render();
    const section = doc.querySelector("section#compare");
    expect(section?.getAttribute("aria-labelledby")).toBe("compare-heading");
    expect(doc.querySelector("h2#compare-heading")?.textContent).toBe(copy.heading);
    expect(section?.querySelector(".vk-section-head")?.getAttribute("data-layout")).toBe("split");
    expect(section?.querySelector(".vk-section-head-lead")?.textContent).toBe(copy.lead);
    expect(section?.querySelector(".vk-eyebrow")).toBeNull();
  });

  it("lays the bar behind the table inside the frame", async () => {
    const doc = await render();
    const frame = doc.querySelector(".vk-comparison-frame");
    expect(frame?.firstElementChild?.classList.contains("vk-comparison-bar")).toBe(true);
    expect(frame?.querySelector(".vk-comparison-bar")?.getAttribute("aria-hidden")).toBe("true");
    expect(frame?.lastElementChild?.tagName).toBe("TABLE");
  });

  it("reveals the card alone, never the heading, the lead or a paragraph", async () => {
    const doc = await render();
    const revealed = Array.from(doc.querySelectorAll("[data-reveal]"));
    expect(revealed).toHaveLength(1);
    expect(revealed[0]?.className).toContain("vk-comparison-card");
  });

  it("is one real table with a caption and one column header per tool, verbatra first and the manual workflow last", async () => {
    const doc = await render();
    const table = doc.querySelector("table.vk-comparison-table");
    expect(table?.querySelector("caption")?.textContent).toBe(copy.caption);
    const heads = Array.from(table?.querySelectorAll("thead th") ?? []);
    expect(heads.every((head) => head.getAttribute("scope") === "col")).toBe(true);
    expect(heads).toHaveLength(COMPARISON_TOOLS.length + 1);
    expect(heads[0]?.textContent).toBe(copy.columns.question);
    expect(heads[1]?.textContent).toBe("Verbatra");
    expect(heads.at(-1)?.textContent).toContain(copy.columns.manual);
    expect(heads.at(-1)?.textContent).toContain(copy.columns.manualShort);
  });

  it("marks the own column on its header and every one of its cells, and no other", async () => {
    const doc = await render();
    const own = Array.from(doc.querySelectorAll(".vk-comparison-self"));
    expect(own).toHaveLength(COMPARISON_ROWS.length + 1);
    expect(own.every((node) => node.matches("th, td"))).toBe(true);
    const firstCells = Array.from(
      doc.querySelectorAll("tbody tr:not(.vk-comparison-label) td:first-of-type"),
    );
    expect(firstCells.every((cell) => cell.classList.contains("vk-comparison-self"))).toBe(true);
    expect(doc.querySelectorAll("table col")).toHaveLength(0);
  });

  it("gives each row a real row header and an aria-hidden duplicate label row for the phone", async () => {
    const doc = await render();
    const bodies = Array.from(doc.querySelectorAll("tbody"));
    expect(bodies).toHaveLength(COMPARISON_ROWS.length);
    bodies.forEach((body, index) => {
      const row = COMPARISON_ROWS[index] as (typeof COMPARISON_ROWS)[number];
      const label = copy.rows[row];
      const rowHead = body.querySelector("th[scope='row']");
      expect(rowHead?.textContent).toBe(label);
      const duplicate = body.querySelector("tr.vk-comparison-label td");
      expect(duplicate?.textContent).toBe(label);
      expect(duplicate?.closest("tr")?.getAttribute("aria-hidden")).toBe("true");
      expect(duplicate?.getAttribute("colspan")).toBe(String(COMPARISON_TOOLS.length + 1));
      expect(
        body.querySelector("tr.vk-comparison-label")?.nextElementSibling?.contains(rowHead ?? null),
      ).toBe(true);
    });
  });

  it("renders one mark and one hidden verdict word per cell, matching the data", async () => {
    const doc = await render();
    COMPARISON_ROWS.forEach((row, rowIndex) => {
      const cells = Array.from(
        doc
          .querySelectorAll("tbody")
          [rowIndex]?.querySelectorAll("tr:not(.vk-comparison-label) td") ?? [],
      );
      expect(cells).toHaveLength(COMPARISON_TOOLS.length);
      cells.forEach((cell, toolIndex) => {
        const tool = COMPARISON_TOOLS[toolIndex] as ComparisonTool;
        const { verdict } = comparisonCell(row, tool);
        const mark = cell.querySelector("svg.vk-comparison-mark");
        expect(mark?.getAttribute("data-mark"), `${row}.${tool}`).toBe(verdict);
        expect(mark?.getAttribute("aria-hidden")).toBe("true");
        expect(cell.querySelector(".sr-only")?.textContent).toBe(copy.verdicts[verdict]);
        expect(cell.textContent).toBe(copy.verdicts[verdict]);
      });
    });
  });

  it("keeps the legend out of the accessibility tree and prints the checked date, with no source links", async () => {
    const doc = await render();
    const legend = doc.querySelector("ul.vk-comparison-legend");
    expect(legend?.getAttribute("aria-hidden")).toBe("true");
    expect(
      Array.from(legend?.querySelectorAll("li") ?? [], (item) => item.textContent?.trim()),
    ).toEqual([copy.verdicts.yes, copy.verdicts.partial, copy.verdicts.no]);
    expect(doc.querySelector("[data-last-checked]")?.textContent).toBe(
      "Last checked November 16, 2026",
    );
    expect(doc.querySelector("section#compare a")).toBeNull();
  });
});

describe("the landing comparison styles", () => {
  const rules = () => docsStylesheetRules();
  const base = (selector: string) => rulesFor(rules(), selector).find((rule) => rule.media === "");
  const at = (selector: string, media: string) =>
    rulesFor(rules(), selector).find((rule) => rule.media === media);

  it("sizes the bar from the number of tools the table holds", () => {
    expect(base(".vk-comparison")?.declarations["--comparison-columns"]).toBe(
      String(COMPARISON_TOOLS.length),
    );
  });

  it("shows the label row only under 30rem and hides the real row label visually there", () => {
    expect(base(".vk-comparison-label")?.declarations.visibility).toBe("visible");
    const wide = "@media (min-width: 30rem)";
    expect(at(".vk-comparison-label", wide)?.declarations.visibility).toBe("collapse");
    expect(base(".vk-comparison-row-label")?.declarations.position).toBe("absolute");
    expect(at(".vk-comparison-row-label", wide)?.declarations.position).toBe("static");
  });

  it("keeps the marks and the own column visible in forced colors", () => {
    const forced = "@media (forced-colors: active)";
    expect(at(".vk-comparison-mark", forced)?.declarations.stroke).toBe("CanvasText");
    expect(
      at(".vk-comparison-table .vk-comparison-self", forced)?.declarations["border-inline-start"],
    ).toBe("3px solid CanvasText");
  });
});
