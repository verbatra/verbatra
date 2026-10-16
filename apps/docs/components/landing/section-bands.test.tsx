// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Section } from "./section";
import { SectionHead } from "./section-head";

function render(node: ReactNode): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
}

function banded(file: string): boolean {
  return /<Section\s[^>]*\bband\b/.test(readFileSync(join(import.meta.dirname, file), "utf8"));
}

const css = readFileSync(join(process.cwd(), "app/global.css"), "utf8");

describe("landing surface bands", () => {
  it("puts a banded section's content in the shared column inside a full-width band", () => {
    const doc = render(
      <Section id="x" band>
        <p>content</p>
      </Section>,
    );
    const section = doc.querySelector("section#x");
    expect(section?.className).toBe("vk-band");
    expect(section?.firstElementChild?.className).toContain("vk-w-wide");
    expect(section?.firstElementChild?.className).toContain("vk-gutter");
  });

  it("pins which sections from the marquee down to the FAQ sit in a band, in page order", () => {
    expect(
      [
        "marquee.tsx",
        "playground.tsx",
        "flow.tsx",
        "problem.tsx",
        "bento.tsx",
        "code-showcase.tsx",
        "compare.tsx",
        "open-source.tsx",
        "faq.tsx",
      ].map(banded),
    ).toEqual([true, false, true, false, false, true, true, false, true]);
  });

  it("paints the band from the semantic band token between two hairlines", () => {
    const rule = css.slice(css.indexOf(".vk-band {"), css.indexOf("}", css.indexOf(".vk-band {")));
    expect(rule).toContain("background: var(--surface-band);");
    expect(rule).toContain("border-block: 1px solid var(--border-default);");
  });
});

describe("the section head on the 12-column grid", () => {
  it("splits a section head eight to four, so the lead starts on column 9 like the content beside it", () => {
    const doc = render(<SectionHead id="h" title="Title" lead="Lead" />);
    const head = doc.querySelector(".vk-section-head");
    expect(head?.getAttribute("data-layout")).toBe("split");
    expect(head?.classList.contains("vk-grid-12")).toBe(true);
    expect(head?.querySelector(".vk-section-head-title h2")).not.toBeNull();
    expect(head?.querySelector(".vk-section-head-lead")).not.toBeNull();
    expect(css).toMatch(/\.vk-section-head-title \{\s+--grid-span: 8;/);
    expect(css).toMatch(/\.vk-section-head-lead \{\s+--grid-span: 4;/);
  });

  it("stacks the lead under the heading on the first column when asked, and when there is no lead", () => {
    for (const node of [
      <SectionHead key="stacked" id="h" title="Title" lead="Lead" layout="stacked" />,
      <SectionHead key="bare" id="h" title="Title" />,
    ]) {
      const head = render(node).querySelector(".vk-section-head");
      expect(head?.getAttribute("data-layout")).toBe("stacked");
      expect(head?.classList.contains("vk-grid-12")).toBe(false);
    }
  });

  it("lets a grid child start on a set column from 64rem, and only there", () => {
    expect(css).toContain(
      "grid-column: var(--grid-start, auto) / span var(--grid-span, var(--grid-columns));",
    );
  });

  it("varies the section heads instead of splitting every one", () => {
    const layouts = Object.fromEntries(
      [
        "problem.tsx",
        "flow.tsx",
        "bento.tsx",
        "code-showcase.tsx",
        "marquee.tsx",
        "playground.tsx",
        "compare.tsx",
        "open-source.tsx",
        "faq.tsx",
      ].map((file) => {
        const head = /<SectionHead\b[^>]*\/>/s.exec(
          readFileSync(join(import.meta.dirname, file), "utf8"),
        )?.[0];
        if (!head) throw new Error(`no SectionHead in ${file}`);
        const layout = !/\blead=/.test(head)
          ? "heading"
          : /layout="stacked"/.test(head)
            ? "stacked"
            : "split";
        return [file, layout];
      }),
    );
    expect(layouts).toEqual({
      "problem.tsx": "split",
      "flow.tsx": "split",
      "bento.tsx": "heading",
      "code-showcase.tsx": "stacked",
      "marquee.tsx": "split",
      "playground.tsx": "stacked",
      "compare.tsx": "heading",
      "open-source.tsx": "split",
      "faq.tsx": "heading",
    });
  });
});
