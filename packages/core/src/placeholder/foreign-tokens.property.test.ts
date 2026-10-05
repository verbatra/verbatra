import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { foreignPlaceholderTokens, PLACEHOLDER_SYNTAXES } from "./foreign-tokens.js";

const fragment = fc.oneof(
  fc.string(),
  fc.constantFrom(
    "{",
    "}",
    "{{",
    "}}",
    "%",
    "%%",
    "$",
    "(",
    ")",
    ",",
    " ",
    "a",
    "0",
    "s",
    "plural",
  ),
);
const value = fc.array(fragment, { maxLength: 24 }).map((parts) => parts.join(""));

describe("foreignPlaceholderTokens properties", () => {
  it("reports nothing when every syntax is native", () => {
    fc.assert(
      fc.property(value, (input) => {
        expect(foreignPlaceholderTokens(input, PLACEHOLDER_SYNTAXES)).toEqual([]);
      }),
    );
  });

  it("only reports substrings of the value, never more than its length in total", () => {
    fc.assert(
      fc.property(value, (input) => {
        const tokens = foreignPlaceholderTokens(input, []);
        for (const token of tokens) {
          expect(input).toContain(token);
        }
        expect(tokens.join("").length).toBeLessThanOrEqual(input.length);
      }),
    );
  });
});

const URL_RUN = /\S*:\/\/\S*/g;

const urlFragment = fc.oneof(
  fragment,
  fc.constantFrom("://", ":", "/", "\u00a0", "\n", "\u3000", "http://x/%s", "{id}", "%s"),
);
const urlValue = fc.array(urlFragment, { maxLength: 24 }).map((parts) => parts.join(""));
const nativeSyntaxes = fc.subarray([...PLACEHOLDER_SYNTAXES]);

describe("foreignPlaceholderTokens URL masking", () => {
  it("skips exactly the whitespace-delimited runs that contain ://", () => {
    fc.assert(
      fc.property(urlValue, nativeSyntaxes, (input, native) => {
        const blanked = input.replace(URL_RUN, (run) => " ".repeat(run.length));
        expect(foreignPlaceholderTokens(input, native)).toEqual(
          foreignPlaceholderTokens(blanked, native),
        );
      }),
    );
  });
});

const BEFORE_LINEAR_REWRITE =
  /\{\{\s*(?:-\s*)?(?:\p{Nd}+|[\p{L}_$][\p{L}\p{M}\p{Nd}_$.-]*)(?:\s*,[^{}]*)?\s*\}\}/uy;
const doubleBraceBody = fc
  .array(
    fc.constantFrom(" ", "\n", "\t", ",", ", ", "a", "1", "-", "$", "%", ".", "}", "}}", "x y"),
    { maxLength: 12 },
  )
  .map((parts) => `{{${parts.join("")}`);
const otherSyntaxes = PLACEHOLDER_SYNTAXES.filter((syntax) => syntax !== "double-brace");

function matchedBeforeRewrite(segment: string): readonly string[] {
  BEFORE_LINEAR_REWRITE.lastIndex = 0;
  const match = BEFORE_LINEAR_REWRITE.exec(segment);
  return match === null ? [] : [match[0]];
}

describe("foreignPlaceholderTokens double-brace matching", () => {
  it("reports exactly what the backtracking double-brace pattern matched", () => {
    fc.assert(
      fc.property(fc.array(doubleBraceBody, { maxLength: 4 }), (segments) => {
        expect(foreignPlaceholderTokens(segments.join(""), otherSyntaxes)).toEqual(
          segments.flatMap(matchedBeforeRewrite),
        );
      }),
      { numRuns: 2000 },
    );
  });
});
