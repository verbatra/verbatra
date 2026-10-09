// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SUPPORTED_FORMAT_IDS } from "@/lib/landing-facts";

vi.mock("next-intl/server", () => ({
  getTranslations:
    async () =>
    (key: string, values?: Record<string, string>): string =>
      values?.id ? `${key}:${values.id}` : key,
  getLocale: async () => "en",
}));

const { Marquee, MARQUEE_FRAMEWORKS } = await import("./marquee");

type MessageTree = { [key: string]: string | MessageTree };

const MESSAGES = JSON.parse(
  readFileSync(join(import.meta.dirname, "../../messages/en.json"), "utf8"),
) as MessageTree;

function message(path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (node, segment) =>
        typeof node === "object" && node !== null ? (node as MessageTree)[segment] : undefined,
      MESSAGES,
    );
}

async function visibleTrack(label: string): Promise<ReadonlyArray<HTMLAnchorElement>> {
  const markup = renderToStaticMarkup(await Marquee());
  const doc = new DOMParser().parseFromString(markup, "text/html");
  return Array.from(doc.querySelectorAll<HTMLAnchorElement>(`ul[aria-label="${label}"] a`));
}

describe("Marquee", () => {
  it("lists every supported format, in registry order, linked to the formats page", async () => {
    const items = await visibleTrack("formatsLabel");
    expect(items.map((item) => item.dataset.tip)).toEqual(
      SUPPORTED_FORMAT_IDS.map((id) => `formatTip:${id}`),
    );
    expect(new Set(items.map((item) => item.getAttribute("href")))).toEqual(
      new Set(["/docs/formats"]),
    );
  });

  it("leads with the frameworks row, each with a translated tip naming its format", async () => {
    const items = await visibleTrack("frameworksLabel");
    expect(items.map((item) => item.textContent)).toEqual(
      MARQUEE_FRAMEWORKS.map((framework) => framework.name),
    );
    for (const item of items) {
      expect(item.getAttribute("href")).toBe("/docs/formats");
      expect(typeof message(`landing.marquee.${item.dataset.tip}`)).toBe("string");
    }
  });

  it("scrolls the frameworks row left and the formats row right", async () => {
    const markup = renderToStaticMarkup(await Marquee());
    const doc = new DOMParser().parseFromString(markup, "text/html");
    const rows = Array.from(doc.querySelectorAll<HTMLElement>(".vk-marquee"));
    expect(rows.map((row) => row.dataset.direction)).toEqual(["left", "right"]);
    expect(rows[0]?.querySelector("ul")?.getAttribute("aria-label")).toBe("frameworksLabel");
    expect(rows[1]?.querySelector("ul")?.getAttribute("aria-label")).toBe("formatsLabel");
  });

  it("counts a click on any item as a marquee call to action naming its row", async () => {
    for (const row of ["frameworks", "formats"]) {
      for (const item of await visibleTrack(`${row}Label`)) {
        expect(item.dataset.umamiEvent).toBe("click-cta");
        expect(item.dataset.umamiEventLocation).toBe("marquee");
        expect(item.dataset.umamiEventTarget).toBe(row);
      }
    }
  });

  it("names the band after both rows, frameworks and formats", async () => {
    const markup = renderToStaticMarkup(await Marquee());
    const doc = new DOMParser().parseFromString(markup, "text/html");
    expect(doc.querySelector("section")?.getAttribute("aria-label")).toBe("label");
    expect(message("landing.marquee.label")).toBe("Supported frameworks and formats");
    expect(message("landing.marquee.providers")).toBeUndefined();
  });

  it("hides the duplicate track that keeps the loop seamless from assistive technology and the tab order", async () => {
    const markup = renderToStaticMarkup(await Marquee());
    const doc = new DOMParser().parseFromString(markup, "text/html");
    expect(doc.querySelectorAll('ul[aria-hidden="true"]')).toHaveLength(2);
    expect(doc.querySelectorAll("ul[aria-label]")).toHaveLength(2);
    const hiddenLinks = Array.from(doc.querySelectorAll("ul[aria-hidden] a"));
    expect(hiddenLinks.length).toBeGreaterThan(0);
    for (const link of hiddenLinks) expect(link.getAttribute("tabindex")).toBe("-1");
  });

  it("stops the scroll and drops the edge mask while a link has keyboard focus", () => {
    const css = readFileSync(join(import.meta.dirname, "../../app/global.css"), "utf8");
    expect(css).toMatch(
      /\.vk-marquee:has\(:focus-visible\) \{[^}]*mask-image: none;[^}]*\}\s*\.vk-marquee:has\(:focus-visible\) \.vk-track \{\s*animation: none;/,
    );
  });
});
