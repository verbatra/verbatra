// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LANDING_NAV_SECTIONS, LANDING_SECTIONS } from "@/lib/landing-sections";
import { docsStylesheetRules, rulesFor } from "@/lib/stylesheet-rules";
import { LANDING_OFFSET_REM, startMotion } from "./motion-root";

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
  it("is a labelled nav listing demo, how, formats, control, workflows and the FAQ in page order", async () => {
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

  it("stays visible without JavaScript and hides before the hero only once the script runs", () => {
    const rules = docsStylesheetRules().filter((rule) => rule.selector.includes("vk-landing-nav"));
    const hiding = rules.filter(
      (rule) => rule.declarations.visibility === "hidden" || rule.declarations.opacity === "0",
    );
    expect(hiding.map((rule) => [rule.selector, rule.media])).toEqual([
      ["html[data-motion-ready]:not([data-past-hero]) .vk-landing-nav-bar", ""],
    ]);
    const [bar] = rulesFor(rules, ".vk-landing-nav-bar");
    for (const property of ["visibility", "opacity", "translate", "transition"]) {
      expect(bar?.declarations[property], property).toBeUndefined();
    }
  });

  it("fades in under no-preference only, and hides at once", () => {
    const moving = docsStylesheetRules().filter(
      (rule) => rule.selector.includes("vk-landing-nav-bar") && "transition" in rule.declarations,
    );
    expect(moving.map((rule) => rule.selector)).toEqual([
      "html[data-past-hero] .vk-landing-nav-bar",
    ]);
    for (const rule of moving)
      expect(rule.media).toContain("prefers-reduced-motion: no-preference");
  });

  it("scrolls the row to a new current link smoothly only under no-preference", () => {
    const smooth = docsStylesheetRules().filter(
      (rule) => rule.declarations["scroll-behavior"] === "smooth",
    );
    expect(smooth.map((rule) => [rule.selector, rule.media])).toEqual([
      [".vk-landing-nav-scroller", "@media (prefers-reduced-motion: no-preference)"],
    ]);
  });

  it("keeps the current link underline inside the scrolling row", () => {
    const rules = docsStylesheetRules();
    const [underline] = rulesFor(rules, '.vk-landing-nav-link[aria-current="true"]::after');
    expect(underline?.declarations.bottom).toBe("0");
    expect(rulesFor(rules, ".vk-landing-nav-scroller")[0]?.declarations["overflow-y"]).toBe(
      "hidden",
    );
  });

  it("offsets anchors and the section observer by one shared header and nav height", () => {
    const rules = docsStylesheetRules();
    const declared = (selector: string, property: string) =>
      rulesFor(rules, selector)[0]?.declarations[property];
    expect(declared(".vk-home", "--vk-landing-offset")).toBe(`${LANDING_OFFSET_REM}rem`);
    expect(declared(".vk-home [id]", "scroll-margin-top")).toBe("var(--vk-landing-offset)");
    const rem = (value: string | undefined) => Number.parseFloat(value ?? "") * 16;
    const header = rem(declared(".vk-landing-nav", "top"));
    const link = rem(declared(".vk-landing-nav-link", "min-height"));
    const border = Number.parseFloat(declared(".vk-landing-nav-bar", "border-bottom") ?? "");
    expect(header).toBe(56);
    expect(LANDING_OFFSET_REM * 16).toBe(header + link + border);
  });
});

describe("section ownership", () => {
  it("gives every section after the hero a link, except the marquee strip and the closing call", () => {
    expect(
      LANDING_SECTIONS.filter(
        (id) => !(LANDING_NAV_SECTIONS as ReadonlyArray<string>).includes(id),
      ),
    ).toEqual(["hero", "marquee", "finalCta"]);
  });

  it("marks each section's own link current while that section is the first in view", () => {
    document.body.innerHTML = `<nav>${LANDING_NAV_SECTIONS.map(
      (id) => `<a href="#${id}" data-nav-link>${id}</a>`,
    ).join(
      "",
    )}</nav>${LANDING_NAV_SECTIONS.map((id) => `<section id="${id}"></section>`).join("")}`;
    const fired: Array<(entries: IntersectionObserverEntry[]) => void> = [];
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: (entries: IntersectionObserverEntry[]) => void) {
          fired.push(callback);
        }
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      },
    );
    const stop = startMotion();
    const presence = fired[1];
    const owner = () =>
      [...document.querySelectorAll("[aria-current]")].map((link) => link.getAttribute("href"));
    let previous: Element | null = null;
    for (const id of LANDING_NAV_SECTIONS) {
      const target = document.getElementById(id) as Element;
      const entries = [{ target, isIntersecting: true }];
      if (previous) entries.push({ target: previous, isIntersecting: false });
      presence?.(entries as IntersectionObserverEntry[]);
      expect(owner(), id).toEqual([`#${id}`]);
      previous = target;
    }
    stop();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
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
      ["loop.tsx", "loop"],
      ["faq.tsx", "faq"],
    ] as const) {
      const source = readFileSync(join(import.meta.dirname, file), "utf8");
      expect(source, file).toContain(`id="${id}"`);
      expect(source, file).toMatch(/id(=|: )"?[a-z]+-heading|HEADING_ID/);
    }
  });
});
