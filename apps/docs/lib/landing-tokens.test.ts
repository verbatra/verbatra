import { describe, expect, it } from "vitest";
import {
  docsGlobalCss,
  docsStylesheetRules,
  rulesFor,
  stylesheetRules,
  uiTokensCss,
} from "@/lib/stylesheet-rules";

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

describe("the landing scale", () => {
  const FROM_TABLET = "@media (min-width: 48rem)";
  const TABLET_TO_LAPTOP = "@media (min-width: 48rem) and (max-width: 1365.98px)";
  const override = (media: string, selector: string) =>
    rulesFor(rules, selector).find((rule) => rule.media === media)?.declarations;

  it("raises the section heading to 3.5rem and the lead to 22px on the landing from 48rem", () => {
    expect(override(FROM_TABLET, ".vk-home")?.["--text-h2"]).toBe("3.5rem");
    expect(override(FROM_TABLET, ".vk-home")?.["--text-lead"]).toBe("22px");
  });

  it("leaves the shared scale and every phone size alone", () => {
    expect(rootToken("--text-h2")).toBe("clamp(1.9rem, 1.3rem + 2vw, 3rem)");
    expect(rootToken("--text-lead")).toBe("clamp(1.0625rem, 1rem + 0.35vw, 1.25rem)");
    expect(rootToken("--text-xs")).toBe("0.75rem");
    expect(
      rulesFor(rules, ".vk-home").filter(
        (rule) => rule.media !== FROM_TABLET && "--text-h2" in rule.declarations,
      ),
    ).toEqual([]);
    expect(rulesFor(stylesheetRules(uiTokensCss()), ".vk-home")).toEqual([]);
  });

  it("keeps the wide column as it was", () => {
    expect(rootToken("--width-wide")).toBe("1285px");
  });

  it("sizes demo code at 14px in a single wide card and 13px in a 2-up pane, from 48rem", () => {
    expect(override(FROM_TABLET, ".vk-home")?.["--vk-code-size"]).toBe("14px");
    expect(override(FROM_TABLET, ".vk-home")?.["--vk-code-size-pane"]).toBe("13px");
  });

  it("reads the code variable with the old size as the phone fallback", () => {
    const code = rulesFor(rules, ".vk-lock-code").find((rule) => rule.media === "");
    expect(code?.declarations["font-size"]).toBe("var(--vk-code-size, var(--text-xs))");
    const paneRule = rules.find(
      (rule) =>
        rule.media === "" &&
        rule.selector.split(/,\s*/).includes(".vk-hl-pane .vk-lock-code") &&
        "font-size" in rule.declarations,
    );
    expect(paneRule?.declarations["font-size"]).toBe("var(--vk-code-size-pane, var(--text-xs))");
    expect(paneRule?.selector.split(/,\s*/)).toContain(".vk-hl-rail .vk-lock-code");
  });

  it("holds the features pane at the pane size between 48rem and 1366px", () => {
    expect(override(TABLET_TO_LAPTOP, ".vk-home #features")?.["--vk-code-size"]).toBe(
      "var(--vk-code-size-pane)",
    );
  });

  it("sets the FAQ aside heading at 2.5rem from 64rem and 3rem from 80rem, where the sticky unit has to fit a 672px window", () => {
    expect(override("@media (min-width: 64rem)", ".vk-faq-aside .vk-h2")?.["font-size"]).toBe(
      "2.5rem",
    );
    expect(override("@media (min-width: 80rem)", ".vk-faq-aside .vk-h2")?.["font-size"]).toBe(
      "3rem",
    );
  });

  it("never touches --text-xs or the shared tokens file from the landing", () => {
    expect(
      rules.filter(
        (rule) => rule.selector.startsWith(".vk-home") && "--text-xs" in rule.declarations,
      ),
    ).toEqual([]);
  });
});

describe("the landing tile surface", () => {
  it("is mockup F's card and hairline in the dark theme and a white card in the light theme", () => {
    const themed = (prefix: string) =>
      stylesheetRules(uiTokensCss()).find(
        (rule) => rule.selector.startsWith(prefix) && "--surface-tile" in rule.declarations,
      )?.declarations;
    expect(themed(".dark")?.["--surface-tile"]).toBe("hsl(240 26% 8%)");
    expect(themed(".dark")?.["--border-tile"]).toBe("hsl(240 22% 16%)");
    expect(themed(".light")?.["--surface-tile"]).toBe("hsl(0 0% 100%)");
    expect(themed(".light")?.["--border-tile"]).toBe("var(--border-default)");
    expect(
      stylesheetRules(docsGlobalCss()).some((rule) => "--surface-tile" in rule.declarations),
    ).toBe(false);
  });

  it.each([".vk-deck-item", ".vk-faq-item", ".vk-banner-file", ".vk-closer"])(
    "paints %s from the tile tokens",
    (selector) => {
      const rule = rulesFor(rules, selector).find((entry) => entry.media === "");
      expect(rule?.declarations.border).toBe("1px solid var(--border-tile)");
      if (selector !== ".vk-closer")
        expect(rule?.declarations.background).toBe("var(--surface-tile)");
    },
  );
});

describe("the landing page surface", () => {
  it("is the void in the dark theme and the page tone in the light theme, leaving --v-void alone", () => {
    const dark = rulesFor(rules, ".dark").find((rule) => "--surface-page" in rule.declarations);
    expect(dark?.declarations["--surface-page"]).toBe("var(--v-void)");
    const light = rulesFor(rules, ".light").find((rule) => "--surface-page" in rule.declarations);
    expect(light?.declarations["--surface-page"]).toBe("var(--surface-bg)");
    expect(light?.declarations["--v-void"]).toBe("hsl(0 0% 100%)");
  });

  it.each([".vk-home", ".vk-footer", ".vk-faq-aside > .vk-section-aside-side"])(
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

describe("the hero title", () => {
  it("sizes the hero title like mockup F, capped by its column", () => {
    expect(rootToken("--banner-title")).toBe("min(clamp(2.875rem, 6.6vw, 5.75rem), 15.5cqi)");
    const title = rulesFor(rules, ".vk-banner-title").find((rule) => rule.media === "");
    expect(title?.declarations["font-weight"]).toBe("600");
    expect(title?.declarations["letter-spacing"]).toBe("-0.05em");
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
    expect(child?.declarations["grid-column"]).toBe("span var(--grid-span, var(--grid-columns))");
  });
});
