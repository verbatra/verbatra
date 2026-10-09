// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LANDING_NAV_SECTIONS, LANDING_SECTIONS } from "@/lib/landing-sections";

vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace?: string) => (key: string) => `${namespace}.${key}`,
}));

const { LandingNav } = await import("./landing-nav");

async function nav(): Promise<Document> {
  return new DOMParser().parseFromString(renderToStaticMarkup(await LandingNav()), "text/html");
}

const css = readFileSync(join(process.cwd(), "app/global.css"), "utf8");
const flat = css.replace(/\s+/g, " ");

describe("LandingNav", () => {
  it("is a labelled nav listing demo, how, formats, control and the FAQ in page order", async () => {
    const doc = await nav();
    const element = doc.querySelector("nav");
    expect(element?.getAttribute("aria-label")).toBe("landing.nav.sections.label");
    const links = [...doc.querySelectorAll<HTMLAnchorElement>("nav a")];
    expect(links.map((link) => link.getAttribute("href"))).toEqual(
      LANDING_NAV_SECTIONS.map((id) => `#${id}`),
    );
    expect(links.map((link) => link.textContent)).toEqual(
      LANDING_NAV_SECTIONS.map((id) => `landing.nav.sections.${id}`),
    );
    const order = LANDING_NAV_SECTIONS.map((id) => LANDING_SECTIONS.indexOf(id));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order.every((index) => index >= 0)).toBe(true);
  });

  it("links in-page anchors that the motion observer can find, with no analytics attribute", async () => {
    const links = [...(await nav()).querySelectorAll("a")];
    for (const link of links) {
      expect(link.hasAttribute("data-nav-link")).toBe(true);
      expect([...link.attributes].some((attr) => attr.name.startsWith("data-umami"))).toBe(false);
      expect(link.hasAttribute("aria-current")).toBe(false);
    }
  });

  it("scrolls sideways inside an edge fade on a phone", async () => {
    const scroller = (await nav()).querySelector(".vk-landing-nav-scroller");
    expect(scroller?.classList.contains("vk-edge-fade")).toBe(true);
  });

  it("takes no layout space and sits under the sticky site header", () => {
    expect(flat).toContain(
      ".vk-landing-nav { position: sticky; top: 3.5rem; z-index: 30; height: 0; }",
    );
    expect(flat).toContain(".vk-landing-nav-bar { position: absolute;");
  });

  it("shows only once the hero has scrolled away, and moves at once under reduced motion", () => {
    expect(flat).toMatch(/\.vk-landing-nav-bar \{[^}]*visibility: hidden; opacity: 0;/);
    expect(flat).toContain(
      "html[data-past-hero] .vk-landing-nav-bar { visibility: visible; opacity: 1; }",
    );
    const base = flat.match(/\.vk-landing-nav-bar \{[^}]*\}/)?.[0] ?? "";
    expect(base).not.toMatch(/transition|translate|animation/);
    expect(flat).toContain(
      "@media (prefers-reduced-motion: no-preference) { .vk-landing-nav-bar { translate: 0 -4px; transition:",
    );
  });

  it("offsets every anchor target by the header and nav height", () => {
    expect(flat).toContain(".vk-home [id] { scroll-margin-top: 6.25rem; }");
  });
});

describe("the landing page", () => {
  it("renders the nav right after the hero", () => {
    const page = readFileSync(join(process.cwd(), "app/[lang]/(home)/page.tsx"), "utf8");
    expect(page).toContain('{id === "hero" ? <LandingNav /> : null}');
  });

  it("gives every linked section an id and its heading an id", () => {
    for (const [file, id] of [
      ["showcase.tsx", "showcase"],
      ["proof.tsx", "how"],
      ["formats.tsx", "formats"],
      ["control.tsx", "control"],
      ["faq.tsx", "faq"],
    ] as const) {
      const source = readFileSync(join(import.meta.dirname, file), "utf8");
      expect(source, file).toContain(`id="${id}"`);
      expect(source, file).toMatch(/id(=|: )"?[a-z]+-heading|HEADING_ID/);
    }
  });
});
