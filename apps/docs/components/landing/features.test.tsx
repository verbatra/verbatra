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

  it("gives the studio card one screenshot pair and every other card one hidden canvas, no text in either visual", () => {
    const visuals = cards().map((card) => card.querySelector(".vk-feature-visual"));
    expect(
      visuals.map((visual) => (visual?.querySelector("canvas") ? "canvas" : "screenshot")),
    ).toEqual(LANDING_FEATURES.map(({ id }) => (id === "studio" ? "screenshot" : "canvas")));
    for (const visual of visuals) {
      expect(visual?.textContent).toBe("");
      expect(visual?.querySelector("svg, text, figure, button")).toBeNull();
    }
    expect(root.querySelectorAll("canvas")).toHaveLength(LANDING_FEATURES.length - 1);
    expect(root.querySelectorAll("img")).toHaveLength(2);
    for (const canvas of root.querySelectorAll("canvas")) {
      expect(canvas.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("shows the real studio overview in both themes, decorative, lazy and at its intrinsic size", () => {
    const images = Array.from(root.querySelectorAll("li.vk-feature .vk-feature-visual img"));
    expect(images).toHaveLength(2);
    expect(images[0]?.closest("li")?.querySelector("h3")?.textContent).toBe(
      en.landing.features.items.studio.title,
    );
    expect(images.map((image) => decodeURIComponent(image.getAttribute("src") ?? ""))).toEqual([
      expect.stringContaining("/screenshots/studio-overview-dark.webp"),
      expect.stringContaining("/screenshots/studio-overview-light.webp"),
    ]);
    for (const image of images) {
      expect(image.getAttribute("alt")).toBe("");
      expect(image.getAttribute("aria-hidden")).toBe("true");
      expect(image.getAttribute("width")).toBe("2880");
      expect(image.getAttribute("height")).toBe("1280");
      expect(image.getAttribute("loading")).toBe("lazy");
      expect(image.getAttribute("fetchpriority")).toBeNull();
      expect(image.getAttribute("src")).not.toMatch(/^https?:/);
    }
    for (const theme of ["dark", "light"]) {
      expect(
        existsSync(join(process.cwd(), `public/screenshots/studio-overview-${theme}.webp`)),
      ).toBe(true);
    }
  });

  it("names each canvas after its feature, in order, leaving studio to the screenshot", () => {
    expect(
      Array.from(root.querySelectorAll("canvas"), (canvas) => canvas.getAttribute("data-feature")),
    ).toEqual(LANDING_FEATURES.filter(({ id }) => id !== "studio").map(({ id }) => id));
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
