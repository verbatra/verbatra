// @vitest-environment jsdom

import { Callout } from "fumadocs-ui/components/callout";
import { CodeBlock, Pre } from "fumadocs-ui/components/codeblock";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { docsStylesheetRules, type StyleRule } from "@/lib/stylesheet-rules";

const rules = docsStylesheetRules();

function parse(markup: string): Document {
  return new DOMParser().parseFromString(markup, "text/html");
}

function matching(element: Element | null, property: string, media = ""): StyleRule[] {
  if (!element) throw new Error("element not found");
  return rules.filter((rule) => {
    if (rule.media !== media || !(property in rule.declarations)) return false;
    if (/::?(before|after|highlight)/.test(rule.selector)) return false;
    try {
      return element.matches(rule.selector);
    } catch {
      return false;
    }
  });
}

const SIDEBAR = `
<aside id="nd-sidebar"><div>
  <div class="tabs"><div class="vk-sidebar-tabs"></div></div>
  <div><div>
    <a id="top" data-active="false" href="/docs">Introduction</a>
    <div id="group" data-state="open">
      <button><span class="vk-label">Guides</span></button>
      <div id="rail" data-state="open">
        <p id="sub"><span class="vk-sidebar-group">Automate</span></p>
        <a id="item" data-active="true" href="/docs/a">A</a>
      </div>
    </div>
    <div id="plain" data-state="open"><div data-state="open"><a id="stray" data-active="false" href="/x">X</a></div></div>
  </div></div>
</div></aside>`;

describe("sidebar rules", () => {
  const doc = parse(SIDEBAR);
  const at = (id: string) => doc.getElementById(id);

  it("starts a rail item one step in, and a top-level link at the single left edge", () => {
    const railPadding = matching(at("item"), "padding-inline-start");
    expect(railPadding.map((rule) => rule.declarations["padding-inline-start"])).toContain(
      "1rem !important",
    );
    const topPadding = matching(at("top"), "padding-inline-start");
    expect(topPadding.map((rule) => rule.declarations["padding-inline-start"])).toEqual([
      "0 !important",
    ]);
  });

  it("draws the rail only inside a group that has a label, never inside any other collapsible", () => {
    const railRules = rules.filter(
      (rule) =>
        rule.selector.includes("> div[data-state]::before") ||
        rule.selector.endsWith("div[data-state]::before"),
    );
    expect(railRules.length).toBeGreaterThan(0);
    const rail = at("rail");
    const plain = at("plain")?.firstElementChild ?? null;
    for (const rule of railRules) {
      const base = rule.selector.replace(/::before$/, "");
      expect(rail?.matches(base), rule.selector).toBe(true);
      expect(plain?.matches(base), rule.selector).toBe(false);
    }
  });

  it("indents a sub-group label with the rail items and leaves group labels at the rail edge", () => {
    expect(
      matching(at("sub"), "padding-inline-start").map(
        (rule) => rule.declarations["padding-inline-start"],
      ),
    ).toEqual(["1rem !important"]);
    expect(
      matching(doc.querySelector("button"), "padding-inline-start").map(
        (rule) => rule.declarations["padding-inline-start"],
      ),
    ).toEqual(["0 !important"]);
  });

  it("pads the viewport that holds the groups and nothing else", () => {
    const viewport = doc.querySelector("aside > div > div:nth-child(2)");
    const padded = (element: Element | null) =>
      matching(element, "padding").some(
        (rule) => rule.declarations.padding === "1.25rem 1rem 3rem 1.5rem",
      );
    expect(padded(viewport)).toBe(true);
    expect(padded(at("rail"))).toBe(false);
    expect(padded(doc.querySelector("aside"))).toBe(false);
  });

  it("insets the focus ring of its links so a scroll container never clips it", () => {
    const link = at("item");
    link?.setAttribute("tabindex", "0");
    expect(
      rules.some(
        (rule) =>
          rule.declarations["outline-offset"] === "-2px" &&
          rule.selector.includes("#nd-sidebar") &&
          rule.selector.endsWith(":focus-visible"),
      ),
    ).toBe(true);
  });
});

describe("callout rules", () => {
  const doc = parse(
    renderToStaticMarkup(
      <Callout className="vk-callout" title="Lead">
        Body
      </Callout>,
    ),
  );

  it("hides the bar element and the icon of a Fumadocs callout", () => {
    const hidden = [doc.querySelector('[role="none"]'), doc.querySelector("svg")];
    for (const element of hidden) {
      expect(matching(element, "display").map((rule) => rule.declarations.display)).toContain(
        "none",
      );
    }
  });

  it("does not hide the icon of a Fumadocs callout that lacks the callout class", () => {
    const bare = parse(renderToStaticMarkup(<Callout title="Lead">Body</Callout>));
    expect(matching(bare.querySelector("svg"), "display")).toEqual([]);
  });
});

describe("code block rules", () => {
  const titled = parse(
    renderToStaticMarkup(
      <CodeBlock className="shiki" title="verbatra.config.ts" icon="<svg></svg>">
        <Pre>code</Pre>
      </CodeBlock>,
    ),
  );
  const bare = parse(
    renderToStaticMarkup(
      <CodeBlock className="shiki">
        <Pre>code</Pre>
      </CodeBlock>,
    ),
  );

  it("hides the language icon of a titled block and styles its filename in mono", () => {
    const bar = titled.querySelector("figcaption")?.parentElement ?? null;
    const icon = bar?.firstElementChild ?? null;
    expect(matching(icon, "display").map((rule) => rule.declarations.display)).toContain("none");
    expect(
      matching(titled.querySelector("figcaption"), "font-family").map(
        (rule) => rule.declarations["font-family"],
      ),
    ).toContain("var(--font-mono)");
  });

  it("leaves the first child of an untitled block alone", () => {
    const first = bare.querySelector("figure")?.firstElementChild ?? null;
    expect(
      matching(first, "display").filter((rule) => rule.declarations.display === "none"),
    ).toEqual([]);
  });
});

describe("search dialog rules", () => {
  const dialog = parse(
    '<div role="dialog"><input role="combobox"><div role="listbox"><div role="option" aria-selected="true">r</div></div></div>',
  );
  const foreign = parse(
    '<div role="dialog"><div role="listbox"><div role="option" aria-selected="true">r</div></div></div>',
  );

  it("fills the active result of the search dialog", () => {
    const option = dialog.querySelector('[role="option"]');
    expect(matching(option, "background").map((rule) => rule.declarations.background)).toContain(
      "var(--accent-fill)",
    );
  });

  it("leaves a listbox in any other dialog unstyled", () => {
    const option = foreign.querySelector('[role="option"]');
    expect(matching(option, "background")).toEqual([]);
    expect(matching(option, "border-radius")).toEqual([]);
  });
});

describe("shell breakpoints", () => {
  const find = (selector: string, media: string) =>
    rules.find((rule) => rule.selector === selector && rule.media === media)?.declarations;

  it("opens the sidebar on a phone as a full-width sheet under the header and the breadcrumb bar", () => {
    const sheet = find("#nd-sidebar-mobile", "@media (width < 48rem)");
    expect(sheet?.["inset-block"]).toBe("calc(var(--header-height) + var(--crumb-height)) 0");
    expect(sheet?.width).toBe("100%");
    expect(
      find('#nd-sidebar-mobile[data-state="closed"]', "@media (width < 48rem)")?.animation,
    ).toBe("none");
    expect(
      find('#nd-sidebar-mobile[data-state="open"]', "@media (prefers-reduced-motion: reduce)")
        ?.animation,
    ).toBe("none");
  });

  it("hides the breadcrumb bar from the width where the sidebar stays on screen", () => {
    expect(find(".vk-crumb-bar", "@media (min-width: 48rem)")?.display).toBe("none");
  });

  it("switches every Fumadocs entrance animation off under reduced motion", () => {
    expect(
      find('[class*="animate-fd-"]', "@media (prefers-reduced-motion: reduce)")?.animation,
    ).toBe("none");
  });

  it("keeps the header below the search dialog and raises it only while the sheet is open", () => {
    expect(find('#nd-subnav[data-sheet-open="true"]', "")?.["z-index"]).toBe("50");
  });

  it("holds the page actions at 32px on desktop only, so the phone keeps its 44px target", () => {
    expect(find(".vk-page-actions button", "@media (min-width: 48rem)")?.["min-height"]).toBe(
      "2rem",
    );
    expect(find(".vk-page-actions button", "")?.["min-height"]).toBeUndefined();
  });
});
