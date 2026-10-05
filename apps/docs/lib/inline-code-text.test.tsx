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

  it("sets every backticked span on its own and keeps the text between them", () => {
    const markup = renderToStaticMarkup(<p>{withInlineCode("Run `init`, then `translate`.")}</p>);
    expect([...markup.matchAll(/<code [^>]*>([^<]*)<\/code>/g)].map((match) => match[1])).toEqual([
      "init",
      "translate",
    ]);
    expect(markup).toMatch(/<\/code>, then <code /);
  });

  it("leaves an unmatched backtick and an empty pair as literal text", () => {
    expect(renderToStaticMarkup(<p>{withInlineCode("A `stray tick")}</p>)).toBe(
      "<p>A `stray tick</p>",
    );
    expect(renderToStaticMarkup(<p>{withInlineCode("An `` empty pair")}</p>)).toBe(
      "<p>An `` empty pair</p>",
    );
  });
});
