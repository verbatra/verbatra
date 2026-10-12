// @vitest-environment jsdom

import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GITHUB_URL, NPM_CLI } from "@/components/landing/links";
import { MACHINE_PROVIDER_IDS } from "@/lib/landing-facts";
import type { ProjectStats } from "@/lib/project-stats";
import messages from "@/messages/en.json";

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
  fetchProjectStats: async () => {
    fetched.calls += 1;
    return fetched.stats;
  },
}));

const { ProofStrip, PROOF_STRIP_PROVIDERS } = await import("./proof-strip");

const labels = messages.landing.stats;

async function render(stats?: ProjectStats, locale = "en"): Promise<Document> {
  page.locale = locale;
  const element = await ProofStrip(stats ? { stats } : undefined);
  return new DOMParser().parseFromString(renderToStaticMarkup(element), "text/html");
}

function items(doc: Document): Element[] {
  return Array.from(doc.querySelectorAll(".vk-proof-strip-item"));
}

describe("ProofStrip", () => {
  it("is a named list of stars, weekly downloads and providers", async () => {
    const doc = await render({ stars: 1234, weeklyDownloads: 56_789 });
    expect(doc.querySelector("section")?.getAttribute("aria-label")).toBe(labels.label);
    expect(doc.querySelector("ul")?.getAttribute("role")).toBe("list");
    expect(items(doc).map((item) => item.textContent)).toEqual([
      `1.2K ${labels.stars}`,
      `56.8K ${labels.downloads}`,
      `${PROOF_STRIP_PROVIDERS.join(", ")} ${labels.providers}`,
    ]);
  });

  it("links each figure to its source and the providers to their docs page", async () => {
    const links = (await render({ stars: 1, weeklyDownloads: 2 })).querySelectorAll("a");
    expect(Array.from(links, (link) => link.getAttribute("href"))).toEqual([
      GITHUB_URL,
      NPM_CLI,
      "/docs/providers",
    ]);
    expect(links[0]?.getAttribute("target")).toBe("_blank");
    expect(links[1]?.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("drops a figure it could not fetch, leaving no empty item behind", async () => {
    const doc = await render({ stars: null, weeklyDownloads: 42 });
    expect(items(doc)).toHaveLength(2);
    expect(doc.body.textContent).not.toContain(labels.stars);
    expect(doc.querySelectorAll(".vk-proof-strip-item:empty")).toHaveLength(0);
  });

  it("still shows the providers when both figures are missing", async () => {
    const doc = await render({ stars: null, weeklyDownloads: null });
    expect(items(doc)).toHaveLength(1);
    expect(items(doc)[0]?.classList.contains("vk-proof-strip-providers")).toBe(true);
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
    expect(doc.querySelector(".vk-proof-strip-providers a")?.getAttribute("href")).toBe(
      "/de/docs/providers",
    );
  });

  it("fetches the figures itself when none are passed", async () => {
    const before = fetched.calls;
    const doc = await render();
    expect(fetched.calls).toBe(before + 1);
    expect(items(doc)).toHaveLength(3);
  });
});
