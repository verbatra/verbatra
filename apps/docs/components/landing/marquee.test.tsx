// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MACHINE_PROVIDER_IDS, SUPPORTED_FORMAT_IDS } from "@/lib/landing-facts";

vi.mock("next-intl/server", () => ({
  getTranslations:
    async () =>
    (key: string, values?: Record<string, string>): string =>
      values?.id ? `${key}:${values.id}` : key,
  getLocale: async () => "en",
}));

const { Marquee } = await import("./marquee");

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

  it("lists every provider the sdk resolves, in factory order, each with a translated tip", async () => {
    const items = await visibleTrack("providersLabel");
    const camel = (id: string) =>
      id.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
    expect(items.map((item) => item.dataset.tip)).toEqual(
      MACHINE_PROVIDER_IDS.map((id) => `providers.${camel(id)}`),
    );
    for (const item of items) {
      expect(item.getAttribute("href")).toBe("/docs/providers");
      expect(typeof message(`landing.marquee.${item.dataset.tip}`)).toBe("string");
    }
  });

  it("names the band after both rows, formats and providers", async () => {
    const markup = renderToStaticMarkup(await Marquee());
    const doc = new DOMParser().parseFromString(markup, "text/html");
    expect(doc.querySelector("section")?.getAttribute("aria-label")).toBe("label");
    expect(message("landing.marquee.label")).toBe("Supported formats and providers");
  });

  it("hides the duplicate track that keeps the loop seamless from assistive technology", async () => {
    const markup = renderToStaticMarkup(await Marquee());
    const doc = new DOMParser().parseFromString(markup, "text/html");
    expect(doc.querySelectorAll('ul[aria-hidden="true"]')).toHaveLength(2);
    expect(doc.querySelectorAll("ul[aria-label]")).toHaveLength(2);
  });
});
