// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { eventForClick, reportClick } from "./analytics-click-events";

function dom(html: string, path = "/"): Element {
  window.history.replaceState(null, "", path);
  document.documentElement.lang = "de";
  document.body.innerHTML = html;
  const target = document.querySelector("[data-target]");
  if (!target) throw new Error("no target");
  return target;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("eventForClick: copy_code", () => {
  it.each([
    ["command-row", "command-row"],
    ["ai-prompt", "ai-prompt"],
    ["page-markdown", "page-markdown"],
    ["code-block", "code-block"],
  ])("reports a click on a copy button of the %s surface", (surface, expected) => {
    const target = dom(
      `<button data-copy-surface="${surface}"><span data-target>Copy</span></button>`,
    );
    expect(eventForClick(target)).toEqual(["copy_code", { surface: expected }]);
  });

  it("reports a button inside a marked copy region", () => {
    const target = dom(
      `<div data-copy-surface="code-block"><button><svg data-target></svg></button></div>`,
    );
    expect(eventForClick(target)).toEqual(["copy_code", { surface: "code-block" }]);
  });

  it("ignores a click inside a marked region that is not on a button", () => {
    expect(
      eventForClick(dom(`<div data-copy-surface="code-block"><pre data-target>code</pre></div>`)),
    ).toBeUndefined();
  });

  it("ignores a surface outside the allowlist", () => {
    expect(
      eventForClick(dom(`<button data-copy-surface="secret" data-target>Copy</button>`)),
    ).toBeUndefined();
  });
});

describe("eventForClick: cta_click", () => {
  it("reports the stable cta id with the page language, never the link text", () => {
    const target = dom(
      `<a href="/docs/quickstart" data-cta="hero-quickstart" data-target>Start</a>`,
    );
    expect(eventForClick(target)).toEqual(["cta_click", { id: "hero-quickstart", locale: "de" }]);
  });

  it("ignores a cta id outside the allowlist", () => {
    expect(eventForClick(dom(`<a data-cta="free text" data-target>x</a>`))).toBeUndefined();
  });
});

describe("eventForClick: outbound_click", () => {
  it.each([
    ["https://github.com/verbatra/verbatra", "github"],
    ["https://www.npmjs.com/package/@verbatra/cli", "npm"],
    ["https://registry.modelcontextprotocol.io/x", "mcp-registry"],
    ["https://example.org/", "other"],
  ])("classifies %s as %s", (href, target) => {
    const link = dom(`<a href="${href}" target="_blank" data-target>go</a>`);
    expect(eventForClick(link)).toEqual(["outbound_click", { target, from: "landing" }]);
  });

  it.each([
    [
      "header",
      `<header><a href="https://github.com/x" target="_blank" data-target>go</a></header>`,
      "/",
    ],
    [
      "footer",
      `<footer><a href="https://github.com/x" target="_blank" data-target>go</a></footer>`,
      "/docs",
    ],
    [
      "docs",
      `<main><a href="https://github.com/x" target="_blank" data-target>go</a></main>`,
      "/de/docs/cli",
    ],
    [
      "legal",
      `<main><a href="https://github.com/x" target="_blank" data-target>go</a></main>`,
      "/de/imprint",
    ],
    [
      "landing",
      `<main><a href="https://github.com/x" target="_blank" data-target>go</a></main>`,
      "/de",
    ],
  ])("reports where the link sits: %s", (from, html, path) => {
    expect(eventForClick(dom(html, path))?.[1]).toMatchObject({ from });
  });

  it("finds the link from a nested element", () => {
    const target = dom(
      `<a href="https://github.com/x" target="_blank"><span data-target>go</span></a>`,
    );
    expect(eventForClick(target)?.[0]).toBe("outbound_click");
  });

  it.each([
    ["an internal link", `<a href="/docs" data-target>go</a>`],
    ["a same-origin link in a new tab", `<a href="/docs" target="_blank" data-target>go</a>`],
    ["an external link in the same tab", `<a href="https://github.com/x" data-target>go</a>`],
    ["an unparsable href", `<a href="http://[bad" target="_blank" data-target>go</a>`],
    ["a plain element", `<p data-target>go</p>`],
  ])("ignores %s", (_name, html) => {
    expect(eventForClick(dom(html))).toBeUndefined();
  });
});

describe("reportClick", () => {
  afterEach(() => {
    Reflect.deleteProperty(window, "umami");
  });

  it.each([
    [
      `<button data-copy-surface="ai-prompt" data-target>Copy</button>`,
      "copy_code",
      { surface: "ai-prompt" },
    ],
    [
      `<a data-cta="hero-compare" data-target>x</a>`,
      "cta_click",
      { id: "hero-compare", locale: "de" },
    ],
    [
      `<a href="https://github.com/x" target="_blank" data-target>x</a>`,
      "outbound_click",
      { target: "github", from: "landing" },
    ],
  ])("hands the event of %s to the tracker", (html, name, data) => {
    const track = vi.fn();
    Reflect.set(window, "umami", { track });
    reportClick(dom(html));
    expect(track).toHaveBeenCalledExactlyOnceWith(name, data);
  });

  it("hands nothing to the tracker for an unrelated click", () => {
    const track = vi.fn();
    Reflect.set(window, "umami", { track });
    reportClick(dom(`<p data-target>x</p>`));
    expect(track).not.toHaveBeenCalled();
  });
});
