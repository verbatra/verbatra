import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  breakAfterUnderscores,
  breakInlineCode,
  breakUrlsAtSlashes,
  keepCompoundsWhole,
  keepFlagsWhole,
  keepLinkLabelWhole,
  keepPackageRunsWhole,
} from "./word-breaks";

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

  it("keeps a URL with no path, or a bare host with a port, in one piece", () => {
    expect(markup(breakUrlsAtSlashes("See https://a.de:8080 today"))).toBe(
      `<span>See ${NOWRAP("https://a.de:8080")} today</span>`,
    );
  });

  it("ends the host at a query or a fragment that has no path before it", () => {
    expect(markup(breakUrlsAtSlashes("Go to https://a.de?next=/x now"))).toBe(
      `<span>Go to ${NOWRAP("https://a.de?next=/")}<wbr/>${NOWRAP("x")} now</span>`,
    );
    expect(markup(breakUrlsAtSlashes("Go to https://a.de#part/two now"))).toBe(
      `<span>Go to ${NOWRAP("https://a.de#part/")}<wbr/>${NOWRAP("two")} now</span>`,
    );
    expect(markup(breakUrlsAtSlashes("Go to https://a.de:8080/x now"))).toBe(
      `<span>Go to ${NOWRAP("https://a.de:8080/")}<wbr/>${NOWRAP("x")} now</span>`,
    );
  });

  it("never breaks between two slashes, after the host or inside a nested URL", () => {
    expect(markup(breakUrlsAtSlashes("Open https://a.de//x now"))).toBe(
      `<span>Open ${NOWRAP("https://a.de//")}<wbr/>${NOWRAP("x")} now</span>`,
    );
    expect(markup(breakUrlsAtSlashes("Open https://a.de/x?u=https://b.de now"))).toBe(
      `<span>Open ${NOWRAP("https://a.de/")}<wbr/>${NOWRAP("x?u=https://")}<wbr/>${NOWRAP("b.de")} now</span>`,
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

const SOFT = '<span class="vk-code-break"></span>';

describe("breakInlineCode", () => {
  it("breaks after an underscore, and softly after a dot, slash or bracket between word characters", () => {
    expect(markup(breakInlineCode("MISSING_OPTIONS"))).toBe("<span>MISSING_<wbr/>OPTIONS</span>");
    expect(markup(breakInlineCode("result.config.files"))).toBe(
      `<span>result.${SOFT}config.${SOFT}files</span>`,
    );
    expect(markup(breakInlineCode("terms[].caseSensitive"))).toBe(
      `<span>terms[].${SOFT}caseSensitive</span>`,
    );
    expect(markup(breakInlineCode("messages/{locale}.json"))).toBe(
      `<span>messages/${SOFT}{locale}.${SOFT}json</span>`,
    );
  });

  it("never breaks after a leading or trailing separator", () => {
    expect(markup(breakInlineCode(".json"))).toBe("<span>.json</span>");
    expect(markup(breakInlineCode("dist/"))).toBe("<span>dist/</span>");
  });

  it("keeps every flag whole, so --agent never wraps after a hyphen", () => {
    expect(markup(breakInlineCode("init --agent --client gemini"))).toBe(
      `<span>init ${NOWRAP("--agent")} ${NOWRAP("--client")} gemini</span>`,
    );
  });

  it("keeps a hyphenated piece whole, so next-intl-json never wraps at a hyphen", () => {
    expect(markup(breakInlineCode("next-intl-json"))).toBe(
      `<span>${NOWRAP("next-intl-json")}</span>`,
    );
    expect(markup(breakInlineCode("my-app/en.json"))).toBe(
      `<span>${NOWRAP("my-app/")}${SOFT}en.${SOFT}json</span>`,
    );
  });

  it("leaves a non-string child as it is", () => {
    const element = <em>x</em>;
    expect(breakInlineCode(element)).toBe(element);
  });
});

describe("keepFlagsWhole", () => {
  it("keeps each flag whole, so a line never breaks after its hyphen", () => {
    expect(markup(keepFlagsWhole("npx x init --help -y now"))).toBe(
      `<span>npx x init ${NOWRAP("--help")} ${NOWRAP("-y")} now</span>`,
    );
  });

  it("keeps a hyphenated value after a flag whole, so --skill verbatra-cli never breaks inside the value", () => {
    expect(markup(keepFlagsWhole("add x/y --skill verbatra-cli -y"))).toBe(
      `<span>add x/y ${NOWRAP("--skill")} ${NOWRAP("verbatra-cli")} ${NOWRAP("-y")}</span>`,
    );
    expect(markup(keepFlagsWhole("--skill verbatra-cli then start-with-ai"))).toBe(
      `<span>${NOWRAP("--skill")} ${NOWRAP("verbatra-cli")} then start-with-ai</span>`,
    );
  });

  it("leaves a hyphen inside a word alone and text without a flag as it is", () => {
    expect(markup(keepFlagsWhole("start-with-ai"))).toBe("<span>start-with-ai</span>");
  });

  it("applies to the text around a URL when breakUrlsAtSlashes is given it", () => {
    expect(markup(breakUrlsAtSlashes("see https://a.de/x (or --help)", keepFlagsWhole))).toBe(
      `<span>see ${NOWRAP("https://a.de/")}<wbr/>${NOWRAP("x")} (or ${NOWRAP("--help)")}</span>`,
    );
  });
});

describe("keepPackageRunsWhole", () => {
  it("keeps npx, its flags and the package it runs on one line, and a long flag with its value", () => {
    expect(
      markup(keepPackageRunsWhole("Run: npx -y skills@latest add x/y --skill verbatra-cli -y")),
    ).toBe(
      `<span>Run: ${NOWRAP("npx -y skills@latest")} add x/y ${NOWRAP("--skill verbatra-cli")} ${NOWRAP("-y")}</span>`,
    );
    expect(markup(keepPackageRunsWhole("(if it fails: npx @verbatra/cli init --help)"))).toBe(
      `<span>(if it fails: ${NOWRAP("npx @verbatra/cli")} init ${NOWRAP("--help)")}</span>`,
    );
  });

  it("falls back to keepFlagsWhole when no npx run is in the text", () => {
    expect(markup(keepPackageRunsWhole("add x --help"))).toBe(
      markup(keepFlagsWhole("add x --help")),
    );
  });
});

describe("keepLinkLabelWhole", () => {
  it("keeps a label of up to two words on one line, hyphenated or not", () => {
    expect(markup(keepLinkLabelWhole("MCP server"))).toBe(`<span>${NOWRAP("MCP server")}</span>`);
    expect(markup(keepLinkLabelWhole("MCP-Server"))).toBe(`<span>${NOWRAP("MCP-Server")}</span>`);
    expect(markup(keepLinkLabelWhole("serveur MCP"))).toBe(`<span>${NOWRAP("serveur MCP")}</span>`);
  });

  it("lets a longer label wrap at its spaces while keeping each compound whole", () => {
    expect(markup(keepLinkLabelWhole("Mit einem KI-Agenten einrichten"))).toBe(
      `<span>Mit einem ${NOWRAP("KI-Agenten")} einrichten</span>`,
    );
    expect(markup(keepLinkLabelWhole("Set up with an AI agent"))).toBe(
      "<span>Set up with an AI agent</span>",
    );
  });
});
