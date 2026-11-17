// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { eventForClick, reportClick } from "./analytics-click-events";
import { report } from "./analytics-report";

vi.mock("./analytics-report", () => ({ report: vi.fn() }));

function dom(html: string): Element {
  document.body.innerHTML = html;
  const target = document.querySelector("[data-target]");
  if (!target) throw new Error("no target");
  return target;
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.mocked(report).mockClear();
});

describe("eventForClick: copy_code", () => {
  it.each(["command-row", "ai-prompt", "page-markdown", "code-block"])(
    "reports a click on a copy button of the %s surface",
    (surface) => {
      const target = dom(
        `<button data-copy-surface="${surface}"><span data-target>Copy</span></button>`,
      );
      expect(eventForClick(target)).toEqual(["copy_code", { surface }]);
    },
  );

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
  it("reports the stable cta id, never the link text", () => {
    const target = dom(
      `<a href="/docs/quickstart" data-cta="hero-quickstart" data-target>Start</a>`,
    );
    expect(eventForClick(target)).toEqual(["cta_click", { id: "hero-quickstart" }]);
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
  ])("classifies %s as %s", (href, dest) => {
    const link = dom(`<a href="${href}" target="_blank" data-target>go</a>`);
    expect(eventForClick(link)).toEqual(["outbound_click", { dest }]);
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

describe("eventForClick: mcp_install_click", () => {
  it("reports a click on a marked install link without any property", () => {
    const target = dom(`<a href="cursor://x" data-mcp-install><span data-target>Add</span></a>`);
    expect(eventForClick(target)).toEqual(["mcp_install_click"]);
  });
});

describe("eventForClick: locale_switch", () => {
  it("reports the chosen locale code", () => {
    const target = dom(`<button data-locale-switch="zh-CN"><i data-target></i></button>`);
    expect(eventForClick(target)).toEqual(["locale_switch", { to: "zh-CN" }]);
  });

  it("ignores a locale outside the supported set", () => {
    expect(
      eventForClick(dom(`<button data-locale-switch="xx" data-target>x</button>`)),
    ).toBeUndefined();
  });
});

describe("reportClick", () => {
  it.each([
    [
      `<button data-copy-surface="ai-prompt" data-target>Copy</button>`,
      ["copy_code", { surface: "ai-prompt" }],
    ],
    [`<a data-cta="hero-compare" data-target>x</a>`, ["cta_click", { id: "hero-compare" }]],
    [
      `<a href="https://github.com/x" target="_blank" data-target>x</a>`,
      ["outbound_click", { dest: "github" }],
    ],
    [`<a data-mcp-install data-target>x</a>`, ["mcp_install_click"]],
    [`<button data-locale-switch="de" data-target>x</button>`, ["locale_switch", { to: "de" }]],
  ])("hands the event of %s to report", (html, args) => {
    reportClick(dom(html));
    expect(report).toHaveBeenCalledExactlyOnceWith(...(args as [string, object?]));
  });

  it("reports nothing for an unrelated click", () => {
    reportClick(dom(`<p data-target>x</p>`));
    expect(report).not.toHaveBeenCalled();
  });
});
