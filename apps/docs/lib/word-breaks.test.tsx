import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { breakAfterUnderscores, breakUrlsAtSeparators } from "./word-breaks";

function markup(text: ReactNode): string {
  return renderToStaticMarkup(<span>{text}</span>);
}

describe("breakAfterUnderscores", () => {
  it("offers a line break only after each underscore", () => {
    expect(markup(breakAfterUnderscores("AGENT_FILE_INVALID"))).toBe(
      "<span>AGENT_<wbr/>FILE_<wbr/>INVALID</span>",
    );
  });

  it("leaves a title without underscores or a non-string title as it is", () => {
    const element = <code>translate</code>;
    expect(breakAfterUnderscores("Run notices")).toBe("Run notices");
    expect(breakAfterUnderscores(element)).toBe(element);
  });
});

describe("breakUrlsAtSeparators", () => {
  it("offers a line break in a URL only after a slash or a dot, never inside the scheme's double slash, and keeps each piece whole", () => {
    expect(markup(breakUrlsAtSeparators("Read https://a-b.de/x.md. Then stop."))).toBe(
      '<span>Read <span class="whitespace-nowrap">https://</span><wbr/>' +
        '<span class="whitespace-nowrap">a-b.</span><wbr/>' +
        '<span class="whitespace-nowrap">de/</span><wbr/>' +
        '<span class="whitespace-nowrap">x.</span><wbr/>' +
        '<span class="whitespace-nowrap">md.</span> Then stop.</span>',
    );
  });

  it("leaves text without a URL as it is", () => {
    expect(markup(breakUrlsAtSeparators("No link here."))).toBe("<span>No link here.</span>");
  });
});
