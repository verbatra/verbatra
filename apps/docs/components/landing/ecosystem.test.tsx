// @vitest-environment jsdom

import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { FORMAT_DISPLAY, MACHINE_PROVIDER_IDS, SUPPORTED_FORMAT_IDS } from "@/lib/landing-facts";
import { PROVIDER_DISPLAY } from "@/lib/landing-providers";
import en from "@/messages/en.json";

const humanKind = vi.hoisted(() => ({ label: undefined as string | undefined }));

vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const { default: messages } = await import("@/messages/en.json");
  return {
    getTranslations: async (namespace: string) => {
      const ecosystem = messages.landing.ecosystem;
      const withHuman = humanKind.label
        ? {
            ...messages,
            landing: {
              ...messages.landing,
              ecosystem: { ...ecosystem, kinds: { ...ecosystem.kinds, human: humanKind.label } },
            },
          }
        : messages;
      return createTranslator({ locale: "en", messages: withHuman, namespace: namespace as never });
    },
    getLocale: async () => "en",
  };
});

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { Ecosystem } = await import("./ecosystem");

async function render(): Promise<HTMLElement> {
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(await Ecosystem());
  return root;
}

let root: HTMLElement;

beforeAll(async () => {
  root = await render();
});

describe("Ecosystem", () => {
  it("opens on the ecosystem heading and lead, with no eyebrow above it", () => {
    const heading = root.querySelector("h2");
    expect(heading?.textContent).toBe(en.landing.ecosystem.heading);
    expect(root.textContent).toContain(en.landing.ecosystem.lead);
    expect(root.querySelector(".vk-eyebrow")).toBeNull();
  });

  it("names every machine provider with its config id, grouped by kind", () => {
    const ids = Array.from(
      root.querySelectorAll("section[aria-labelledby='ecosystem-providers'] li code"),
    ).map((code) => code.textContent);
    expect(ids.sort()).toEqual([...MACHINE_PROVIDER_IDS].sort());
    for (const id of MACHINE_PROVIDER_IDS) {
      expect(root.textContent).toContain(PROVIDER_DISPLAY[id].label);
    }
    const kinds = Array.from(root.querySelectorAll("h4")).map((h4) => h4.textContent);
    expect(kinds).toEqual(Object.values(en.landing.ecosystem.kinds));
  });

  it("offers the human-only provider none, linked to its owner page", () => {
    const link = root.querySelector("a[href='/docs/human-only-workflow']");
    expect(link?.textContent).toBe("none");
  });

  it("titles the human-only group once its copy exists", async () => {
    humanKind.label = "Human only";
    try {
      const withLabel = await render();
      const kinds = Array.from(withLabel.querySelectorAll("h4")).map((h4) => h4.textContent);
      expect(kinds.at(-1)).toBe("Human only");
    } finally {
      humanKind.label = undefined;
    }
  });

  it("spells out no provider or format count", () => {
    expect(root.textContent).not.toMatch(/\b(seven|eight|fourteen|7|8|14) (providers|formats)\b/i);
  });

  it("reuses the real format switcher with one tab per supported format", () => {
    const tabs = Array.from(root.querySelectorAll("[role='tab']")).map((tab) => tab.textContent);
    expect(tabs).toEqual(SUPPORTED_FORMAT_IDS.map((id) => FORMAT_DISPLAY[id].label));
    expect(root.querySelectorAll(".vk-formats-file")).toHaveLength(SUPPORTED_FORMAT_IDS.length);
  });

  it("links the providers, formats and custom adapter pages", () => {
    const hrefs = Array.from(root.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(
      expect.arrayContaining(["/docs/providers", "/docs/formats", "/docs/custom-format-adapters"]),
    );
    expect(root.textContent).toContain(en.landing.ecosystem.customFormat);
  });
});
