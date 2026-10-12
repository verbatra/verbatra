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

  it("alternates void and band from the problem down to the FAQ", () => {
    expect(
      [
        "problem.tsx",
        "steps.tsx",
        "bento.tsx",
        "code-showcase.tsx",
        "showcase.tsx",
        "ecosystem.tsx",
        "studio.tsx",
        "compare.tsx",
        "open-source.tsx",
        "faq.tsx",
      ].map(banded),
    ).toEqual([false, true, false, true, false, true, false, true, false, true]);
  });

  it("paints the band from the semantic band token between two hairlines", () => {
    const rule = css.slice(css.indexOf(".vk-band {"), css.indexOf("}", css.indexOf(".vk-band {")));
    expect(rule).toContain("background: var(--surface-band);");
    expect(rule).toContain("border-block: 1px solid var(--border-default);");
  });
});

describe("the section head on the 12-column grid", () => {
  it("splits a section head seven to five", () => {
    const doc = render(<SectionHead id="h" title="Title" lead="Lead" />);
    const head = doc.querySelector(".vk-section-head");
    expect(head?.classList.contains("vk-grid-12")).toBe(true);
    expect(head?.querySelector(".vk-section-head-title h2")).not.toBeNull();
    expect(head?.querySelector(".vk-section-head-lead")).not.toBeNull();
    expect(css).toMatch(/\.vk-section-head-title \{\s+--grid-span: 7;/);
    expect(css).toMatch(/\.vk-section-head-lead \{\s+--grid-span: 5;/);
  });
});
