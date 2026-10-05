import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { breakAfterUnderscores, breakUrlsAtSlashes, keepCompoundsWhole } from "./word-breaks";

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

const NOWRAP = (text: string) => `<span class="whitespace-nowrap">${text}</span>`;

describe("breakUrlsAtSlashes", () => {
  it("offers a line break in a URL only after a path slash, never inside the scheme or between scheme and host", () => {
    expect(markup(breakUrlsAtSlashes("Read https://a-b.de/docs/x.md now"))).toBe(
      `<span>Read ${NOWRAP("https://a-b.de/")}<wbr/>${NOWRAP("docs/")}<wbr/>${NOWRAP("x.md")} now</span>`,
    );
  });

  it("leaves a trailing period outside the URL, so it never sits on a line of its own", () => {
    expect(markup(breakUrlsAtSlashes("Follow https://a.de/x.md. Then stop."))).toBe(
      `<span>Follow ${NOWRAP("https://a.de/")}<wbr/>${NOWRAP("x.md")}. Then stop.</span>`,
    );
  });

  it("leaves a closing parenthesis and the punctuation after it outside the URL", () => {
    expect(markup(breakUrlsAtSlashes("(see https://a.de/x);"))).toBe(
      `<span>(see ${NOWRAP("https://a.de/")}<wbr/>${NOWRAP("x")});</span>`,
    );
  });

  it("keeps a query string whole after the last slash", () => {
    expect(markup(breakUrlsAtSlashes("Open https://a.de/x?y=1&z=2, then go"))).toBe(
      `<span>Open ${NOWRAP("https://a.de/")}<wbr/>${NOWRAP("x?y=1&amp;z=2")}, then go</span>`,
    );
  });

  it("breaks each of two URLs on its own", () => {
    expect(markup(breakUrlsAtSlashes("https://a.de/x and http://b.de/y"))).toBe(
      `<span>${NOWRAP("https://a.de/")}<wbr/>${NOWRAP("x")} and ${NOWRAP("http://b.de/")}<wbr/>${NOWRAP("y")}</span>`,
    );
  });

  it("leaves text without a URL as it is", () => {
    expect(markup(breakUrlsAtSlashes("No link here."))).toBe("<span>No link here.</span>");
  });
});

describe("breakUrlsAtSlashes: authority", () => {
  it("keeps a URL with no path, or a bare host with a port, in one piece", () => {
    expect(markup(breakUrlsAtSlashes("See https://a.de:8080 today"))).toBe(
      `<span>See ${NOWRAP("https://a.de:8080")} today</span>`,
    );
  });
});

describe("keepCompoundsWhole", () => {
  it("keeps every hyphenated compound on one line and leaves the words around it free", () => {
    expect(markup(keepCompoundsWhole("Mit einem KI-Agenten und Coding-Tools"))).toBe(
      `<span>Mit einem ${NOWRAP("KI-Agenten")} und ${NOWRAP("Coding-Tools")}</span>`,
    );
  });

  it("leaves a spaced hyphen and a title without a hyphen as they are", () => {
    expect(keepCompoundsWhole("Translate - then check")).toBe("Translate - then check");
    expect(keepCompoundsWhole("Gate pull requests")).toBe("Gate pull requests");
  });
});
