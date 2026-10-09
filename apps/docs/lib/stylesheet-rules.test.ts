import { describe, expect, it } from "vitest";
import { rulesFor, stylesheetRules } from "@/lib/stylesheet-rules";

describe("stylesheetRules", () => {
  it("reads selectors, their media context and declarations", () => {
    const rules = stylesheetRules(`
      @import "x";
      .a, .b { color: red; transition: opacity 1s,
        translate 1s; }
      @media (width < 40rem) { @supports (x: y) { .c { opacity: 0 } } }
    `);
    expect(rulesFor(rules, ".b")[0]?.declarations).toEqual({
      color: "red",
      transition: "opacity 1s, translate 1s",
    });
    expect(rulesFor(rules, ".c")[0]).toEqual({
      selector: ".c",
      media: "@media (width < 40rem) @supports (x: y)",
      declarations: { opacity: "0" },
    });
  });
});
