import { describe, expect, it } from "vitest";
import { cssBlock, literalColours } from "@/test-support/css-block";

describe("literalColours", () => {
  it.each(["crimson", "rebeccapurple", "lightgoldenrodyellow", "tomato", "white", "Navy"])(
    "finds the named colour %s",
    (name) => {
      expect(literalColours(`.a { color: ${name}; }`)).toEqual([name]);
    },
  );

  it("finds hex and functional notations", () => {
    expect(literalColours(".a { color: #abc; background: rgb(0 0 0); }")).toEqual(["#abc", "rgb("]);
  });

  it("leaves tokens, keywords and identifiers that contain a colour name alone", () => {
    expect(
      literalColours(
        ".a { color: var(--text-danger); background: transparent; outline: 2px solid Highlight; animation-name: vk-gate-red-card; }",
      ),
    ).toEqual([]);
  });
});

describe("cssBlock", () => {
  it("returns the text between two markers and refuses a missing one", () => {
    expect(cssBlock("a { } b { } c { }", "b {", "c {")).toBe("b { } ");
    expect(() => cssBlock("a { }", "x", "y")).toThrow(/no stylesheet block/);
  });
});
