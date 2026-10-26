import { describe, expect, it } from "vitest";
import { docsStylesheetRules } from "@/lib/stylesheet-rules";

const rules = docsStylesheetRules();
const SIDEBARS = ":is(#nd-sidebar, #nd-sidebar-mobile)";
const declarations = (selector: string, media = "") =>
  rules.find((rule) => rule.selector === selector && rule.media === media)?.declarations;

describe("docs shell stylesheet", () => {
  it("draws the sidebar as a 1px rail with one solid accent marker, for the sidebar and its phone sheet alike", () => {
    expect(declarations(`${SIDEBARS} div[id^="radix-"][data-state]::before`)?.background).toBe(
      "var(--vk-rail)",
    );
    expect(declarations(`${SIDEBARS} a[data-active="true"]::before`)).toMatchObject({
      width: "1px",
      background: "var(--accent)",
    });
  });

  it("sets group labels over the rail without the per-depth indent", () => {
    const label = declarations(`${SIDEBARS} :is(button, a):has(> .vk-label)`);
    expect(label?.["padding-inline-start"]).toBe("0 !important");
  });

  it("opens the sidebar on a phone as a full-width sheet under the header and the breadcrumb bar", () => {
    const sheet = declarations("#nd-sidebar-mobile", "@media (width < 48rem)");
    expect(sheet?.["inset-block"]).toBe("calc(var(--header-height) + var(--crumb-height)) 0");
    expect(sheet?.width).toBe("100%");
    expect(
      declarations('#nd-sidebar-mobile[data-state="closed"]', "@media (width < 48rem)"),
    ).toMatchObject({ animation: "none" });
    expect(
      declarations(
        '#nd-sidebar-mobile[data-state="open"]',
        "@media (prefers-reduced-motion: reduce)",
      )?.animation,
    ).toBe("none");
  });

  it("hides the breadcrumb bar from the width where the sidebar stays on screen", () => {
    expect(declarations(".vk-crumb-bar", "@media (min-width: 48rem)")?.display).toBe("none");
  });

  it("skins the table of contents as a straight rail with an accent marker", () => {
    const toc = ":is(#nd-toc, [data-toc-popover-content])";
    expect(declarations(`${toc} div:has(> a[href^="#"])`)?.["border-inline-start"]).toBe(
      "1px solid var(--border-default)",
    );
    expect(
      declarations(`${toc} a[href^="#"][data-active="true"]`)?.["border-inline-start-color"],
    ).toBe("var(--accent)");
    expect(declarations(`${toc} div:has(> a[href^="#"]) > div, ${toc} a > svg`)?.display).toBe(
      "none",
    );
  });

  it("sets a table header as plain strong text over one faint rule, with a mono accent first cell", () => {
    const header = declarations(
      "#nd-page .prose :where(thead th):not(:where(.not-prose, .not-prose *))",
    );
    expect(header?.["border-block-end"]).toBe("1px solid var(--text-faint)");
    expect(header?.background).toBe("transparent");
    expect(header).not.toHaveProperty("text-transform");
    expect(
      declarations(
        "#nd-page .prose :where(td:first-child code):not(:where(.not-prose, .not-prose *))",
      )?.color,
    ).toBe("var(--accent)");
  });

  it("sets a callout as a bar and a tint in its own color, with no icon", () => {
    const callout = declarations(".vk-callout");
    expect(callout?.["border-inline-start"]).toBe("3px solid var(--callout-color)");
    expect(callout?.background).toContain("var(--callout-color)");
    expect(declarations('.vk-callout > :is(div[role="none"], svg)')?.display).toBe("none");
  });

  it("gives a titled code block a mono filename bar without the language icon", () => {
    expect(declarations("figure.shiki figcaption")?.["font-family"]).toBe("var(--font-mono)");
    expect(declarations("figure.shiki > div:has(> figcaption) > div:first-child")?.display).toBe(
      "none",
    );
  });

  it("styles the search dialog on the semantic tokens, with a filled active row", () => {
    expect(declarations('[role="listbox"] [role="option"][aria-selected="true"]')).toMatchObject({
      background: "var(--accent-fill)",
      color: "var(--accent-fill-fg)",
    });
    expect(declarations(".vk-header-search")?.["border-radius"]).toBe("var(--radius-full)");
  });
});
