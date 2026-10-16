// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ComponentProps, ReactNode } from "react";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { preloadRegisteredIslands } from "@/test-support/islands";
import { Section } from "./section";
import { SectionAside, SectionHead } from "./section-head";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const { default: messages } = await import("@/messages/en.json");
  return {
    getTranslations: async (scope: string | { namespace: string }) =>
      createTranslator({
        locale: "en",
        messages,
        namespace: (typeof scope === "string" ? scope : scope.namespace) as never,
      }),
    getLocale: async () => "en",
  };
});

vi.mock("next-intl", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-intl")>();
  const { default: messages } = await import("@/messages/en.json");
  return {
    ...actual,
    useTranslations: (namespace: string) =>
      actual.createTranslator({ locale: "en", messages, namespace: namespace as never }),
  };
});

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

  it("names a section by its heading through aria-labelledby, banded or not", () => {
    for (const band of [true, false]) {
      const doc = render(
        <Section id="x" band={band} labelledBy="x-heading">
          <h2 id="x-heading">Title</h2>
        </Section>,
      );
      expect(doc.querySelector("section#x")?.getAttribute("aria-labelledby")).toBe("x-heading");
    }
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

  it("sets an inline head as a narrow stacked block for the column beside an artifact", () => {
    const head = render(
      <SectionHead id="h" title="Title" lead="Lead" layout="inline" />,
    ).querySelector(".vk-section-head");
    expect(head?.getAttribute("data-layout")).toBe("inline");
    expect(head?.classList.contains("vk-grid-12")).toBe(false);
    expect(head?.classList.contains("vk-section-head-inline")).toBe(true);
    expect(head?.querySelector("h2#h")?.textContent).toBe("Title");
    expect(head?.querySelector(".vk-section-head-lead")?.textContent).toBe("Lead");
  });

  it("sets an aside head in span 4 beside its content in span 8, on one 12-column grid", () => {
    const aside = render(
      <SectionAside id="h" title="Title" lead="Lead">
        <p id="content">content</p>
      </SectionAside>,
    ).querySelector(".vk-section-aside");
    expect(aside?.classList.contains("vk-grid-12")).toBe(true);
    const [head, content] = Array.from(aside?.children ?? []);
    expect(head?.getAttribute("data-layout")).toBe("aside");
    expect(head?.querySelector("h2#h")?.textContent).toBe("Title");
    expect(head?.querySelector(".vk-section-head-lead")?.textContent).toBe("Lead");
    expect(content?.className).toBe("vk-section-aside-content");
    expect(content?.querySelector("#content")).not.toBeNull();
    expect(css).toMatch(/\.vk-section-head-aside \{\s+--grid-span: 4;/);
    expect(css).toMatch(/\.vk-section-aside-content \{\s+--grid-span: 8;/);
  });

  it("opens every section's content one --head-gap under its head, never an ad hoc margin", () => {
    expect(css).toMatch(/:root \{[^}]*--head-gap: 2\.5rem;/);
    expect(css).toMatch(/@media \(min-width: 64rem\) \{\s+:root \{\s+--head-gap: 3\.5rem;/);
    expect(css).toMatch(/\.vk-section-aside \{\s+row-gap: var\(--head-gap\);/);
    expect(css).toMatch(/\.vk-flow \{[^}]*margin-top: var\(--head-gap\);/);
    expect(css).toMatch(/\.vk-playground-layout \{[^}]*gap: var\(--head-gap\);/);
    for (const file of [
      "bento.tsx",
      "code-showcase.tsx",
      "compare.tsx",
      "faq.tsx",
      "open-source.tsx",
      "problem.tsx",
    ]) {
      const source = readFileSync(join(import.meta.dirname, file), "utf8");
      expect(source, file).toContain("mt-(--head-gap)");
      expect(source, file).not.toMatch(/\b(?:lg:)?mt-1[0-4]\b/);
    }
  });

  it("lets a grid child start on a set column from 64rem, and only there", () => {
    expect(css).toContain(
      "grid-column: var(--grid-start, auto) / span var(--grid-span, var(--grid-columns));",
    );
  });

  it("varies the section heads instead of splitting every one", async () => {
    await preloadRegisteredIslands();
    const { Bento } = await import("./bento");
    const { CodeShowcase } = await import("./code-showcase");
    const { Compare } = await import("./compare");
    const { Faq } = await import("./faq");
    const { Flow } = await import("./flow");
    const { Marquee } = await import("./marquee");
    const { OpenSource } = await import("./open-source");
    const { Playground } = await import("./playground");
    const { Problem } = await import("./problem");
    const sections: ReadonlyArray<readonly [string, () => Promise<ReactNode>]> = [
      ["problem", Problem],
      ["flow", Flow],
      ["features", Bento],
      ["code", CodeShowcase],
      ["marquee", Marquee],
      ["playground", Playground],
      ["compare", Compare],
      ["open-source", OpenSource],
      ["faq", () => Faq({ items: [{ id: "formats", question: "Which formats?" }] })],
    ];
    const layouts: Record<string, string | null> = {};
    for (const [id, section] of sections) {
      const doc = new DOMParser().parseFromString(renderToString(await section()), "text/html");
      const head = doc.querySelector(`section#${id} .vk-section-head`);
      if (head === null) throw new Error(`no section head in #${id}`);
      layouts[id] = head.querySelector(".vk-section-head-lead")
        ? head.getAttribute("data-layout")
        : "heading";
    }
    expect(layouts).toEqual({
      problem: "split",
      flow: "stacked",
      features: "split",
      code: "stacked",
      marquee: "aside",
      playground: "inline",
      compare: "heading",
      "open-source": "split",
      faq: "heading",
    });
  });
});
