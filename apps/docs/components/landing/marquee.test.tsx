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

async function render(): Promise<Document> {
  return new DOMParser().parseFromString(renderToStaticMarkup(await Marquee()), "text/html");
}

async function visibleTrack(label: string): Promise<ReadonlyArray<HTMLElement>> {
  const doc = await render();
  return Array.from(
    doc.querySelectorAll<HTMLElement>(`ul[aria-label="${label}"] .vk-marquee-item`),
  );
}

describe("Marquee", () => {
  it("lists every supported format, in registry order, each with its format id as a tip", async () => {
    const items = await visibleTrack("formatsLabel");
    expect(items.map((item) => item.dataset.tip)).toEqual(
      SUPPORTED_FORMAT_IDS.map((id) => `formatTip:${id}`),
    );
  });

  it("leads with the frameworks row, each with a translated tip naming its format", async () => {
    const items = await visibleTrack("frameworksLabel");
    expect(items.map((item) => item.textContent)).toEqual(
      MARQUEE_FRAMEWORKS.map((framework) => framework.name),
    );
    for (const item of items) {
      expect(typeof message(`landing.marquee.${item.dataset.tip}`)).toBe("string");
    }
  });

  it("scrolls the frameworks row left and the formats row right", async () => {
    const doc = await render();
    const rows = Array.from(doc.querySelectorAll<HTMLElement>(".vk-marquee"));
    expect(rows.map((row) => row.dataset.direction)).toEqual(["left", "right"]);
    expect(rows[0]?.querySelector("ul")?.getAttribute("aria-label")).toBe("frameworksLabel");
    expect(rows[1]?.querySelector("ul")?.getAttribute("aria-label")).toBe("formatsLabel");
  });

  it("keeps every scrolling item out of the tab order: the rows hold plain text, no link", async () => {
    const doc = await render();
    expect(doc.querySelectorAll(".vk-marquee a, .vk-marquee [tabindex]")).toHaveLength(0);
  });

  it("gives each row one link, to the page that owns it, without a declarative event", async () => {
    const doc = await render();
    const links = Array.from(doc.querySelectorAll<HTMLAnchorElement>(".vk-marquee-links a"));
    expect(links.map((link) => [link.getAttribute("href"), link.textContent])).toEqual([
      ["/docs/pick-your-stack", "frameworksLink"],
      ["/docs/formats", "formatsLink"],
    ]);
    for (const link of links) expect(link.hasAttribute("data-umami-event")).toBe(false);
    expect(typeof message("landing.marquee.frameworksLink")).toBe("string");
    expect(typeof message("landing.marquee.formatsLink")).toBe("string");
  });

  it("names the band after both rows, frameworks and formats", async () => {
    const doc = await render();
    expect(doc.querySelector("section")?.getAttribute("aria-label")).toBe("label");
    expect(message("landing.marquee.label")).toBe("Supported frameworks and formats");
    expect(message("landing.marquee.providers")).toBeUndefined();
  });

  it("hides the duplicate track that keeps the loop seamless from assistive technology", async () => {
    const doc = await render();
    expect(doc.querySelectorAll('ul[aria-hidden="true"]')).toHaveLength(2);
    expect(doc.querySelectorAll(".vk-marquee ul[aria-label]")).toHaveLength(2);
  });

  it("left-aligns the intro in the shared column and keeps the static rows inside the gutter", async () => {
    const doc = await render();
    const head = doc.querySelector(".vk-marquee-head");
    expect(head?.classList.contains("vk-gutter")).toBe(true);
    expect(head?.classList.contains("vk-w-wide")).toBe(true);
    expect(doc.querySelector(".vk-marquee-intro")?.classList.contains("text-center")).toBe(false);
    const css = readFileSync(join(import.meta.dirname, "../../app/global.css"), "utf8");
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[^@]*\.vk-track \{[^}]*padding-inline: var\(--gutter\);/,
    );
  });
});
