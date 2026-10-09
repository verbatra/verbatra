import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { docsStylesheetRules, rulesFor } from "@/lib/stylesheet-rules";
import { PlaceholderChip } from "./placeholder-chip";

const rules = docsStylesheetRules();

function rootToken(name: string): string | undefined {
  return rulesFor(rules, ":root").find((rule) => rule.media === "" && name in rule.declarations)
    ?.declarations[name];
}

describe("PlaceholderChip", () => {
  it("draws the token as written inside one chip", () => {
    expect(renderToStaticMarkup(<PlaceholderChip token="{{amount}}" />)).toBe(
      '<span class="vk-placeholder" data-placeholder="">{{amount}}</span>',
    );
  });

  it("marks a token the reply broke", () => {
    expect(renderToStaticMarkup(<PlaceholderChip token="{{betrag}}" broken />)).toContain(
      'data-broken=""',
    );
  });
});

describe("the placeholder chip styles", () => {
  const [chip] = rulesFor(rules, ".vk-placeholder");
  const [broken] = rulesFor(rules, ".vk-placeholder[data-broken]");

  it("pads the token by exactly the margin it pulls back, so a chip moves no character", () => {
    expect(chip?.declarations["padding-inline"]).toBe("var(--placeholder-inset)");
    expect(chip?.declarations["margin-inline"]).toBe("calc(-1 * var(--placeholder-inset))");
  });

  it("rings the chip with a box shadow rather than a border and never wraps it", () => {
    expect(chip?.declarations.border).toBeUndefined();
    expect(chip?.declarations["box-shadow"]).toBe("inset 0 0 0 1px var(--placeholder-ring)");
    expect(chip?.declarations["white-space"]).toBe("nowrap");
  });

  it("draws in the accent and strikes a broken token in the danger colour", () => {
    expect(chip?.declarations.color).toBe("var(--placeholder-fg)");
    expect(rootToken("--placeholder-fg")).toBe("var(--accent)");
    expect(broken?.declarations.color).toBe("var(--text-danger)");
    expect(broken?.declarations["text-decoration"]).toBe("line-through");
  });
});

describe("the redesign tokens", () => {
  it("caps the section heading at 3rem", () => {
    expect(rootToken("--text-h2")).toBe("clamp(1.9rem, 1.3rem + 2vw, 3rem)");
  });

  it("no longer ships the unused globe wash", () => {
    expect(rules.some((rule) => "--wash-globe" in rule.declarations)).toBe(false);
  });

  it("derives the section band from the semantic surfaces", () => {
    expect(rootToken("--surface-band")).toBe(
      "color-mix(in srgb, var(--surface-card) 40%, var(--surface-bg))",
    );
  });

  it("fades the hero grid backdrop out toward the bottom", () => {
    expect(rootToken("--hero-grid-mask")).toMatch(/^linear-gradient\(to bottom,/);
  });
});

describe("the 12-column landing grid", () => {
  const grid = rulesFor(rules, ".vk-grid-12");
  const narrow = grid.find((rule) => rule.media === "");
  const wide = grid.find((rule) => rule.media === "@media (min-width: 64rem)");
  const [child] = rulesFor(rules, ".vk-grid-12 > *");

  it("stacks one column below 64rem with the shared 24px gap", () => {
    expect(narrow?.declarations["grid-template-columns"]).toBe("minmax(0, 1fr)");
    expect(narrow?.declarations.gap).toBe("var(--grid-gap)");
    expect(rootToken("--grid-gap")).toBe("1.5rem");
  });

  it("splits into twelve columns from 64rem, a child spanning --grid-span or the full row", () => {
    expect(rootToken("--grid-columns")).toBe("12");
    expect(wide?.declarations["grid-template-columns"]).toBe(
      "repeat(var(--grid-columns), minmax(0, 1fr))",
    );
    expect(child?.media).toBe("@media (min-width: 64rem)");
    expect(child?.declarations["grid-column"]).toBe("span var(--grid-span, var(--grid-columns))");
  });
});
