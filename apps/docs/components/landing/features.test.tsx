// @vitest-environment jsdom

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { i18n } from "@/lib/i18n";
import { LANDING_FEATURES } from "@/lib/landing-features";
import de from "@/messages/de.json";
import en from "@/messages/en.json";
import es from "@/messages/es.json";
import fr from "@/messages/fr.json";

vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const { default: messages } = await import("@/messages/en.json");
  return {
    getTranslations: async (namespace: string) =>
      createTranslator({ locale: "en", messages, namespace: namespace as never }),
    getLocale: async () => "de",
  };
});

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { Features } = await import("./features");

let root: HTMLElement;

beforeAll(async () => {
  root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(await Features());
});

function cards(): Element[] {
  return Array.from(root.querySelectorAll("ul.vk-feature-grid > li.vk-feature"));
}

describe("Features", () => {
  it("lists one card per landing feature, in order, under a bracketed label", () => {
    expect(root.querySelector("p.vk-eyebrow")?.textContent).toBe(en.landing.features.label);
    expect(cards().map((card) => card.querySelector("h3")?.textContent)).toEqual(
      LANDING_FEATURES.map(({ id }) => en.landing.features.items[id].title),
    );
  });

  it("links each title to its command page in the reader's locale", () => {
    expect(cards().map((card) => card.querySelector("h3 a")?.getAttribute("href"))).toEqual(
      LANDING_FEATURES.map(({ docsPath }) => `/de${docsPath}`),
    );
    expect(root.querySelectorAll("a")).toHaveLength(LANDING_FEATURES.length);
  });

  it("links only command pages that exist in every locale", () => {
    for (const { docsPath } of LANDING_FEATURES) {
      const page = docsPath.replace(/^\/docs\//, "");
      for (const locale of i18n.languages) {
        const suffix = locale === i18n.defaultLanguage ? "" : `.${locale}`;
        expect(
          existsSync(join(process.cwd(), `content/docs/${page}${suffix}.mdx`)),
          `${page} ${locale}`,
        ).toBe(true);
      }
    }
  });

  it("draws every visual as hidden line art, never as a picture with text", () => {
    for (const card of cards()) {
      const art = card.querySelector(".vk-feature-visual > svg.vk-feature-art");
      expect(art?.getAttribute("aria-hidden")).toBe("true");
      expect(art?.querySelectorAll(".vk-feature-lit").length).toBeGreaterThan(0);
      expect(art?.querySelector("text, image")).toBeNull();
    }
  });

  it("carries a title and a body for every feature in every locale", () => {
    for (const catalog of [en, de, es, fr]) {
      for (const { id } of LANDING_FEATURES) {
        const item = catalog.landing.features.items[id];
        expect(item.title.length, id).toBeGreaterThan(0);
        expect(item.body.length, id).toBeGreaterThan(0);
      }
    }
  });
});
