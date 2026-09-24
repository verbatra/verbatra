// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
  getLocale: async () => "en",
}));
vi.mock("@/components/landing/hero-demo", () => ({ HeroDemo: () => null }));
vi.mock("@/components/landing/hero-facts", () => ({ HeroFacts: () => null }));
vi.mock("@/components/landing/package-install", () => ({ PackageInstall: () => null }));

const { LandingHero } = await import("./landing-hero");

const GLOBAL_CSS = readFileSync(join(process.cwd(), "app/global.css"), "utf8");

function keyframes(name: string): string {
  const match = new RegExp(`@keyframes ${name} \\{([\\s\\S]*?)\\n\\}`).exec(GLOBAL_CSS);
  if (!match) throw new Error(`@keyframes ${name} not found`);
  return match[1] as string;
}

async function renderHero(): Promise<Document> {
  const markup = renderToStaticMarkup(await LandingHero());
  return new DOMParser().parseFromString(markup, "text/html");
}

describe("LandingHero: largest contentful paint", () => {
  it("keeps the headline and lead out of the fading rise", async () => {
    const doc = await renderHero();
    for (const selector of ["h1", "p.vk-lead"]) {
      const element = doc.querySelector(selector);
      expect(element, selector).not.toBeNull();
      expect(element?.closest(".vk-rise"), selector).toBeNull();
      expect(element?.closest(".vk-rise-settle"), selector).not.toBeNull();
    }
  });

  it("settles by transform only, so the text is painted from the first frame", () => {
    expect(keyframes("vk-rise-settle")).not.toMatch(/opacity/);
    expect(keyframes("vk-rise")).toMatch(/opacity: 0/);
  });
});
