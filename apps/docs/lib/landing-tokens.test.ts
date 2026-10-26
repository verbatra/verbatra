import { describe, expect, it } from "vitest";
import { docsStylesheetRules, rulesFor } from "@/lib/stylesheet-rules";

const rules = docsStylesheetRules();

function rootToken(name: string): string | undefined {
  return rulesFor(rules, ":root").find((rule) => rule.media === "" && name in rule.declarations)
    ?.declarations[name];
}

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

  it.each([
    "--hero-grid-mask",
    "--rise-distance",
    "--v-pink",
    "--v-violet",
    "--placeholder-fg",
    "--placeholder-fill",
    "--placeholder-ring",
    "--placeholder-inset",
  ])("no longer ships the retired %s token", (token) => {
    expect(rules.some((rule) => token in rule.declarations)).toBe(false);
  });
});

describe("the landing tile surface", () => {
  it("is mockup F's card and hairline in the dark theme and a white card in the light theme", () => {
    expect(rootToken("--surface-tile")).toBe("hsl(240 26% 8%)");
    expect(rootToken("--border-tile")).toBe("hsl(240 22% 16%)");
    const light = rulesFor(rules, "html.light").find(
      (rule) => "--surface-tile" in rule.declarations,
    );
    expect(light?.declarations["--surface-tile"]).toBe("hsl(0 0% 100%)");
    expect(light?.declarations["--border-tile"]).toBe("var(--border-default)");
  });

  it.each([
    ".vk-tile",
    ".vk-feature",
    ".vk-faq-item",
    ".vk-marquee-item",
    ".vk-banner-file",
    ".vk-closer",
  ])("paints %s from the tile tokens", (selector) => {
    const rule = rulesFor(rules, selector).find((entry) => entry.media === "");
    expect(rule?.declarations.border).toBe("1px solid var(--border-tile)");
    if (selector !== ".vk-closer")
      expect(rule?.declarations.background).toBe("var(--surface-tile)");
  });
});

describe("the landing page surface", () => {
  it("is the void in the dark theme and the page tone in the light theme, leaving --v-void alone", () => {
    expect(rootToken("--surface-page")).toBe("var(--v-void)");
    const light = rulesFor(rules, "html.light").find(
      (rule) => "--surface-page" in rule.declarations,
    );
    expect(light?.declarations["--surface-page"]).toBe("var(--color-fd-background)");
    expect(light?.declarations["--v-void"]).toBe("hsl(0 0% 100%)");
  });

  it.each([".vk-home", ".vk-footer", ".vk-faq-aside > .vk-section-head-aside"])(
    "paints %s from the page surface so no band forms between the sections and the footer",
    (selector) => {
      const painted = rulesFor(rules, selector).filter(
        (entry) => entry.declarations.background !== undefined,
      );
      expect(painted.map((entry) => entry.declarations.background)).toEqual([
        "var(--surface-page)",
      ]);
    },
  );
});

describe("the statement to highlights spacing", () => {
  it("keeps the statement's own bottom padding small so both sections together stay near mockup F", () => {
    const padding = rulesFor(rules, ".vk-statement").find((rule) => rule.media === "")
      ?.declarations["padding-block"];
    expect(padding).toBe("clamp(5rem, 12.5vw, 11.25rem) clamp(0rem, 3.6vw, 3.25rem)");
  });
});

describe("the hero and statement titles", () => {
  it("sizes the hero title like mockup F, capped by its column, and the statement never larger", () => {
    expect(rootToken("--banner-title")).toBe("min(clamp(2.875rem, 6.6vw, 5.75rem), 15.5cqi)");
    expect(rootToken("--statement-title")).toBe("clamp(2.5rem, 6.4vw, 5.75rem)");
    const title = rulesFor(rules, ".vk-banner-title").find((rule) => rule.media === "");
    expect(title?.declarations["font-weight"]).toBe("600");
    expect(title?.declarations["letter-spacing"]).toBe("-0.05em");
    const statement = rulesFor(rules, ".vk-statement-title").find((rule) => rule.media === "");
    expect(statement?.declarations["font-size"]).toBe("var(--statement-title)");
  });
});

describe("the headline gradient", () => {
  it("runs from the strong text color to the accent in both themes", () => {
    expect(rootToken("--gradient-headline")).toBe(
      "linear-gradient(90deg, var(--text-strong) 30%, var(--accent))",
    );
  });

  it("paints only the second line of the hero title, with a solid fallback under forced colors", () => {
    const users = rules.filter((rule) =>
      Object.values(rule.declarations).some((value) => value.includes("--gradient-headline")),
    );
    expect(users.map((rule) => rule.selector)).toEqual([".vk-banner-title-lit"]);
    const forced = rulesFor(rules, ".vk-banner-title-lit").find(
      (rule) => rule.media === "@media (forced-colors: active)",
    );
    expect(forced?.declarations["-webkit-text-fill-color"]).toBe("CanvasText");
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
    expect(child?.declarations["grid-column"]).toBe(
      "var(--grid-start, auto) / span var(--grid-span, var(--grid-columns))",
    );
  });
});
