import { matchSpans } from "@verbatra/ai-providers";
import { describe, expect, it } from "vitest";
import { unsafePatternReason } from "./pattern-safety.js";
import { MAX_PATTERN_SCAN_LENGTH } from "./scan-text.js";

describe("unsafePatternReason", () => {
  it.each([
    ["(a+)+$", "nested-repeat"],
    ["(a*)*", "nested-repeat"],
    ["(?:\\w+\\s?)+$", "nested-repeat"],
    ["(a|aa)*b", "nested-repeat"],
    ["(?<word>x+){2,}", "nested-repeat"],
    ["(a{1,3})+", "nested-repeat"],
    ["(?:a|b)*", "nested-repeat"],
    ["(?:a?){20}x", "nested-repeat"],
    ["(?:a?){30}x", "nested-repeat"],
    ["(?:\\w?){12}\\w*x", "nested-repeat"],
    ["(?:\\w{0,1}){30}x", "nested-repeat"],
    ["(?:a{2}){3}", "nested-repeat"],
    ["(?:\\u{41}?){2}", "nested-repeat"],
    ["\\w*\\w*x", "several-unbounded"],
    ["[a-z]*[a-z]*[a-z]*[a-z]*!", "several-unbounded"],
    ["\\w+?x\\w*?", "several-unbounded"],
    ["a{2,}b+", "several-unbounded"],
    ["(?=\\w*x)\\w+", "several-unbounded"],
    ["\\(a+\\)+", "several-unbounded"],
    ["\\w{0,64}\\w*x", "too-many-paths"],
    ["a?a?a?\\w*x", "too-many-paths"],
    ["\\w{0,4}\\w*x", "too-many-paths"],
    ["(?:a|aa|aaa)\\w{0,7}\\w*x", "too-many-paths"],
    ["\\w{0,63}\\w{0,63}x", "too-many-paths"],
  ])("rejects %s as %s", (source, reason) => {
    expect(unsafePatternReason(source)).toBe(reason);
  });

  it.each([
    "Falcon",
    "Project\\s+Falcon",
    "(?:Falcon|Osprey)",
    "(ab)+",
    "(a+)?",
    "(a+){1}",
    "[(+)]+",
    "(?<=x)a+",
    "(?!a+)b",
    "a{2}",
    "[\\s\\S]*?x",
    "x??y",
    "{literal",
    "(\\u{41})+",
    "\\u{41}{2}",
    "[\\u{41}-\\u{5A}]+",
    "\\p{Lu}+",
    "(?<n>a)\\k<n>+",
    "(?:a|b)?",
  ])("accepts %s", (source) => {
    expect(unsafePatternReason(source)).toBe(undefined);
  });
});

describe("the worst accepted shapes at the scan cap", () => {
  const LETTERS = "a".repeat(MAX_PATTERN_SCAN_LENGTH);
  const SHAPES: readonly (readonly [string, string])[] = [
    ["\\w{0,3}\\w*x", LETTERS],
    ["[a-z]{1,4}[a-z]*!", LETTERS],
    ["a?a?\\w*x", LETTERS],
    ["\\w?\\w{0,1}\\w*x", LETTERS],
    ["(?:a|aa)\\w?\\w*x", LETTERS],
    ["(?:a|aa|aaa|aaaa)\\w*x", LETTERS],
    ["(?=\\w{0,3}x)\\w*", LETTERS],
    ["\\w{0,31}\\w{0,31}x", LETTERS],
    ["(?:a|b|c|d)\\w{0,15}\\w{0,15}x", LETTERS],
    ["[\\s\\S]*?x\\w{0,3}", LETTERS],
    ["\\w*x", LETTERS],
  ];

  it.each(SHAPES)(
    "%s is accepted and its fastest of five runs takes under 250 ms",
    (source, text) => {
      expect(unsafePatternReason(source)).toBe(undefined);
      const pattern = new RegExp(source, "gu");
      const fastest = Math.min(
        ...Array.from({ length: 5 }, () => {
          const started = performance.now();
          matchSpans(pattern, text);
          return performance.now() - started;
        }),
      );

      expect(fastest).toBeLessThan(250);
    },
  );
});
