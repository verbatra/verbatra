// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { docsStylesheetRules } from "@/lib/stylesheet-rules";
import { contrast, themeTokens } from "@/test-support/contrast";
import { NEW_PILL_CLASS, NewAnnouncement, NewPill } from "./new-pill";

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

const rules = docsStylesheetRules();

describe("NewPill", () => {
  it("reads as its text alone, its sparkle icon hidden from assistive technology", () => {
    const doc = parse(renderToStaticMarkup(<NewPill>New</NewPill>));
    const pill = doc.querySelector(`.${NEW_PILL_CLASS}`);
    expect(pill?.textContent).toBe("New");
    const icon = pill?.querySelector("svg.vk-pill-new-icon");
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
    expect(pill?.children).toHaveLength(1);
  });

  it("wraps the pill, the text and a hidden chevron in one new-tab link", () => {
    const doc = parse(
      renderToStaticMarkup(
        <NewAnnouncement href="https://example.com/notes" badge="New" newTab="(opens in a new tab)">
          Notes
        </NewAnnouncement>,
      ),
    );
    const link = doc.querySelector("a.vk-announce");
    expect(link?.getAttribute("href")).toBe("https://example.com/notes");
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link?.textContent).toBe("New Notes (opens in a new tab)");
    expect(link?.querySelector(".vk-announce-chevron")?.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("the new pill stylesheet", () => {
  it("draws the pill as accent text with no fill, border, rim or animation", () => {
    const pill = rules.find((rule) => rule.selector === ".vk-pill-new" && rule.media === "");
    expect(pill?.declarations.color).toBe("var(--accent)");
    for (const property of ["background", "border", "box-shadow", "animation", "padding"]) {
      expect(pill?.declarations[property], property).toBeUndefined();
    }
    expect(rules.filter((rule) => rule.selector.includes(".vk-pill-new::"))).toEqual([]);
  });

  it.each(["dark", "light"] as const)(
    "holds the accent label at AA on the page in the %s theme",
    (theme) => {
      expect(contrast(themeTokens()[theme], "--accent", "--surface-bg")).toBeGreaterThanOrEqual(
        4.5,
      );
    },
  );

  it("tints the announcement softly and gives it no border", () => {
    const announce = rules.find((rule) => rule.selector === ".vk-announce" && rule.media === "");
    expect(announce?.declarations.background).toContain("var(--accent)");
    expect(announce?.declarations.border).toBeUndefined();
  });
});
