// @vitest-environment jsdom

import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GITHUB_URL, NPM_CLI } from "@/components/landing/links";
import { MACHINE_PROVIDER_IDS, SUPPORTED_FORMAT_IDS } from "@/lib/landing-facts";
import type { ProjectStats } from "@/lib/project-stats";
import { docsStylesheetRules } from "@/lib/stylesheet-rules";
import messages from "@/messages/en.json";
import { preloadRegisteredIslands } from "@/test-support/islands";

const page = vi.hoisted(() => ({ locale: "en" }));
const fetched = vi.hoisted(() => ({
  stats: { stars: 1234, weeklyDownloads: 987 } as ProjectStats,
  calls: 0,
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const { default: catalog } = await import("@/messages/en.json");
  return {
    getTranslations: async (namespace: string) =>
      createTranslator({ locale: page.locale, messages: catalog, namespace: namespace as never }),
    getLocale: async () => page.locale,
  };
});

vi.mock("@/lib/project-stats", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/project-stats")>()),
  loadProjectStats: async () => {
    fetched.calls += 1;
    return fetched.stats;
  },
}));

const { ProofStrip, PROOF_STRIP_PROVIDERS, providerList } = await import("./proof-strip");

const labels = messages.landing.stats;

await preloadRegisteredIslands();

async function render(stats?: ProjectStats, locale = "en"): Promise<Document> {
  page.locale = locale;
  const element = await ProofStrip(stats ? { stats } : undefined);
  return new DOMParser().parseFromString(renderToStaticMarkup(element), "text/html");
}

function facts(doc: Document): (string | null)[] {
  return Array.from(doc.querySelectorAll("[data-fact]"), (node) => node.getAttribute("data-fact"));
}

function items(doc: Document): Element[] {
  return Array.from(doc.querySelectorAll(".vk-proof-strip-item"));
}

describe("ProofStrip", () => {
  it("is a named list of stars, weekly downloads, providers and formats", async () => {
    const doc = await render({ stars: 1234, weeklyDownloads: 56_789 });
    expect(doc.querySelector("section")?.getAttribute("aria-label")).toBe(labels.label);
    expect(doc.querySelector("ul")?.getAttribute("role")).toBe("list");
    expect(items(doc).map((item) => item.textContent)).toEqual([
      `1.2K ${labels.stars}`,
      `56.8K ${labels.downloads}`,
      `${providerList("en")} ${labels.providers}`,
      `${SUPPORTED_FORMAT_IDS.length} ${labels.formats}`,
    ]);
  });

  it("links each figure to its source and the providers to their docs page", async () => {
    const links = (await render({ stars: 1000, weeklyDownloads: 2000 })).querySelectorAll("a");
    expect(Array.from(links, (link) => link.getAttribute("href"))).toEqual([
      GITHUB_URL,
      NPM_CLI,
      "/docs/providers",
      "/docs/formats",
    ]);
    expect(links[0]?.getAttribute("target")).toBe("_blank");
    expect(links[1]?.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it.each([
    [2, 0],
    [1, 57],
    [0, 0],
  ])(
    "shows %d stars and %d downloads as they are, with no display threshold",
    async (stars, downloads) => {
      const doc = await render({ stars, weeklyDownloads: downloads });
      expect(
        Array.from(doc.querySelectorAll("[data-live-stat]"), (node) => node.textContent),
      ).toEqual([String(stars), String(downloads)]);
    },
  );

  it("falls back to a GitHub or npm link, never an empty value, when a figure could not be fetched", async () => {
    const doc = await render({ stars: null, weeklyDownloads: null });
    const stars = doc.querySelector('[data-stat="stars"] a');
    const downloads = doc.querySelector('[data-stat="downloads"] a');
    expect(stars?.getAttribute("href")).toBe(GITHUB_URL);
    expect(stars?.textContent).toBe(labels.starsFallback);
    expect(downloads?.getAttribute("href")).toBe(NPM_CLI);
    expect(downloads?.textContent).toBe(labels.downloadsFallback);
    expect(doc.querySelectorAll("[data-live-stat]")).toHaveLength(0);
    expect(facts(doc)).toEqual(["providers", "formats"]);
    for (const stat of doc.querySelectorAll("[data-stat]")) {
      expect(stat.textContent).not.toMatch(/\d/);
    }
    for (const value of doc.querySelectorAll(".vk-proof-strip-value")) {
      expect(value.textContent?.trim()).not.toBe("");
    }
  });

  it("counts the formats from the registry rather than a typed number", async () => {
    const doc = await render({ stars: null, weeklyDownloads: null }, "de");
    expect(doc.querySelector('[data-fact="formats"] a')?.getAttribute("href")).toBe(
      "/de/docs/formats",
    );
    expect(doc.querySelector('[data-fact="formats"] [data-count]')?.textContent).toBe(
      String(SUPPORTED_FORMAT_IDS.length),
    );
  });

  it("names the OpenAI-compatible provider by its short label in the strip", () => {
    expect(PROOF_STRIP_PROVIDERS).toContain("OpenAI-compatible");
    expect(PROOF_STRIP_PROVIDERS.join(" ")).not.toContain("Ollama");
  });

  it("joins the providers the way the page locale writes a list", async () => {
    expect(providerList("en")).toMatch(/, and LibreTranslate$/);
    expect(providerList("de")).toMatch(/ und LibreTranslate$/);
    const doc = await render({ stars: null, weeklyDownloads: null }, "fr");
    expect(doc.querySelector('[data-fact="providers"] .vk-proof-strip-value')?.textContent).toBe(
      providerList("fr"),
    );
  });

  it("names every machine provider and never spells out how many there are", async () => {
    expect(PROOF_STRIP_PROVIDERS).toHaveLength(MACHINE_PROVIDER_IDS.length);
    const text = (await render({ stars: null, weeklyDownloads: null })).body.textContent ?? "";
    expect(text).not.toMatch(/\b\d+\s+(translation )?providers\b/);
    expect(text).toContain("Anthropic");
    expect(text).toContain("LibreTranslate");
  });

  it("formats the figures for the page locale and localizes the providers link", async () => {
    const doc = await render({ stars: 1500, weeklyDownloads: null }, "de");
    expect(items(doc)[0]?.querySelector(".vk-proof-strip-value")?.textContent).toBe(
      new Intl.NumberFormat("de", { notation: "compact", maximumFractionDigits: 1 }).format(1500),
    );
    expect(doc.querySelector('[data-fact="providers"] a')?.getAttribute("href")).toBe(
      "/de/docs/providers",
    );
  });

  it("fetches the figures itself when none are passed", async () => {
    const before = fetched.calls;
    const doc = await render();
    expect(fetched.calls).toBe(before + 1);
    expect(items(doc)).toHaveLength(4);
  });

  it("keeps every strip link at least 24px tall", () => {
    const rule = docsStylesheetRules().find(
      (entry) => entry.selector === ".vk-proof-strip-link" && entry.media === "",
    );
    expect(rule?.declarations.display).toBe("inline-block");
    expect(rule?.declarations["min-height"]).toBe("1.5rem");
  });
});
