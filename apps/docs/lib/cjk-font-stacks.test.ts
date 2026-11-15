import { describe, expect, it } from "vitest";
import { docsStylesheetRules, rulesFor } from "@/lib/stylesheet-rules";

const CJK_STACKS: ReadonlyArray<readonly [string, readonly string[]]> = [
  [":root:lang(zh-CN)", ["PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", "Noto Sans SC"]],
  [
    ":root:lang(ja)",
    ["Hiragino Sans", "Yu Gothic UI", "Meiryo", "Noto Sans CJK JP", "Noto Sans JP"],
  ],
];

function families(stack: string): string[] {
  return stack
    .replace(/var\([^)]*\)/g, "GEIST")
    .split(",")
    .map((family) => family.trim().replace(/^"|"$/g, ""));
}

describe("the per-language sans stacks", () => {
  const rules = docsStylesheetRules();

  it.each(CJK_STACKS)(
    "sets %s to Geist, then its system faces in order, then the generics",
    (selector, faces) => {
      const stack = rulesFor(rules, selector)[0]?.declarations["--font-sans"] ?? "";
      expect(families(stack)).toEqual([
        "GEIST",
        ...faces,
        "ui-sans-serif",
        "system-ui",
        "sans-serif",
      ]);
    },
  );

  it("keeps Geist first, so Latin text and digits inside a CJK page stay in the brand face", () => {
    for (const [selector] of CJK_STACKS) {
      const stack = rulesFor(rules, selector)[0]?.declarations["--font-sans"] ?? "";
      expect(stack.startsWith("var(--font-geist-sans")).toBe(true);
    }
  });

  it("leaves the shared sans token untouched and keeps Geist Mono first in each mono stack", () => {
    expect(rulesFor(rules, ":root")[0]?.declarations["--font-sans"]).toBe(
      "var(--font-geist-sans, ui-sans-serif, system-ui, sans-serif)",
    );
    for (const [selector, faces] of CJK_STACKS) {
      const stack = rulesFor(rules, selector).find((rule) => rule.declarations["--font-mono"]);
      expect(families(stack?.declarations["--font-mono"] ?? "")).toEqual([
        "GEIST",
        ...faces,
        "ui-monospace",
        "monospace",
      ]);
    }
  });
});

describe("the CJK typography block", () => {
  const rules = docsStylesheetRules();
  const CJK = ":is(:lang(zh-CN), :lang(ja))";

  function cjkRule(subject: string) {
    return rules.find((rule) => rule.selector.includes(CJK) && rule.selector.includes(subject));
  }

  it("zeroes the tracking tokens and sets Han leading", () => {
    const tokens = rules.find((rule) => rule.selector === `:root:is(:lang(zh-CN), :lang(ja))`);
    expect(tokens?.declarations).toMatchObject({
      "--tracking-display": "0",
      "--tracking-heading": "0",
      "--tracking-snug": "0",
      "--tracking-tight": "0",
      "--leading-display": "1.2",
      "--leading-heading": "1.3",
    });
  });

  it("removes tracking and uppercase from every element, even one that sets them inline", () => {
    expect(cjkRule(`:is(:lang(zh-CN), :lang(ja)),`)?.declarations).toMatchObject({
      "letter-spacing": "normal !important",
      "text-transform": "none !important",
    });
  });

  it("never slants Han", () => {
    expect(cjkRule("em, i, cite")?.declarations["font-style"]).toBe("normal");
  });

  it("keeps landing headings whole between words and balances every heading", () => {
    expect(cjkRule(".vk-faq-question")?.declarations["word-break"]).toBe("keep-all");
    expect(cjkRule("h1, h2, h3, h4")?.declarations).toMatchObject({
      "line-height": "1.3",
      "text-wrap": "balance",
    });
  });

  it.each(
    rules.filter((rule) => rule.selector.includes(CJK)).map((rule) => [rule.selector] as const),
  )("matches only under a CJK lang: %s", (selector) => {
    expect(selector.startsWith(":root:is(:lang(zh-CN), :lang(ja))")).toBe(true);
  });
});
