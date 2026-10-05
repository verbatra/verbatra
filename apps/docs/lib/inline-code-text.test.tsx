import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { withInlineCode } from "./inline-code-text";

describe("withInlineCode", () => {
  it("sets a backticked span in code type and keeps the text around it", () => {
    const markup = renderToStaticMarkup(
      <p>{withInlineCode("What happens when you run `verbatra translate`.")}</p>,
    );
    expect(markup).toMatch(
      /^<p>What happens when you run <code [^>]*>verbatra translate<\/code>\.<\/p>$/,
    );
    expect(markup).not.toContain("`");
  });

  it("returns text without backticks unchanged", () => {
    expect(withInlineCode("One engine, four ways to drive it.")).toBe(
      "One engine, four ways to drive it.",
    );
  });
});
