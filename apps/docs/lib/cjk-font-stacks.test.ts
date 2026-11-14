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

  it("leaves the shared sans token and every monospace stack untouched", () => {
    expect(rulesFor(rules, ":root")[0]?.declarations["--font-sans"]).toBe(
      "var(--font-geist-sans, ui-sans-serif, system-ui, sans-serif)",
    );
    for (const [selector] of CJK_STACKS) {
      expect(rulesFor(rules, selector)[0]?.declarations["--font-mono"]).toBeUndefined();
    }
  });
});
