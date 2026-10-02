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
