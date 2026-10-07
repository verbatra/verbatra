// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GITHUB_URL } from "@/components/landing/links";
import { HERO_FACTS } from "@/lib/landing-facts";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

const { HeroFacts } = await import("./hero-facts");

function facts(): Element | null {
  return new DOMParser()
    .parseFromString(renderToStaticMarkup(<HeroFacts />), "text/html")
    .querySelector("dl");
}

describe("HeroFacts", () => {
  it("lists every hero fact as a term and its value", () => {
    const dl = facts();
    expect([...(dl?.querySelectorAll("dt") ?? [])].map((dt) => dt.textContent)).toEqual(
      HERO_FACTS.map((fact) => fact.key),
    );
    expect([...(dl?.querySelectorAll("dd") ?? [])].map((dd) => dd.textContent)).toEqual(
      HERO_FACTS.map((fact) => fact.value),
    );
  });

  it("links only the GitHub row, to the repository, as a counted outbound link", () => {
    const dl = facts();
    const links = [...(dl?.querySelectorAll("a") ?? [])];
    expect(links).toHaveLength(1);
    const [link] = links;
    expect(link?.getAttribute("href")).toBe(GITHUB_URL);
    expect(link?.getAttribute("rel")).toBe("noreferrer noopener");
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("data-umami-event")).toBe("outbound-link");
    expect(link?.getAttribute("data-umami-event-target")).toBe("github");
    expect(link?.closest("dd")?.previousElementSibling?.textContent).toBe("github");
  });

  it("sets every other value as plain text", () => {
    const values = [...(facts()?.querySelectorAll("dd") ?? [])].slice(0, -1);
    for (const value of values) {
      expect(value.children).toHaveLength(0);
    }
  });

  it("keeps every term and value on one line and spans the actions block from 90rem", () => {
    const css = readFileSync(join(process.cwd(), "app/global.css"), "utf8").replace(/\s+/g, " ");
    expect(css).toContain(
      ".vk-hero-facts-table dt { color: var(--text-faint); text-align: start; white-space: nowrap; }",
    );
    expect(css).toContain(
      ".vk-hero-facts-table dd { margin: 0; color: var(--text-strong); white-space: nowrap; }",
    );
    expect(css).toContain("column-gap: var(--hero-grid-column-gap);");
    expect(css).toContain(
      "@media (min-width: 90rem) { .vk-hero-grid { grid-template-columns: minmax(0, 1fr) var(--width-hero-actions) minmax(0, 1fr);",
    );
    expect(css).toContain(
      ".vk-hero-facts { grid-area: facts; align-self: stretch; justify-content: end; }",
    );
    expect(css).toContain(
      ".vk-hero-facts-table { grid-template-columns: auto auto; align-content: space-between; width: auto; row-gap: 0; }",
    );
  });
});
