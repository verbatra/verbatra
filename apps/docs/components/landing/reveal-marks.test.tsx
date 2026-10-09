// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace?: string) =>
    Object.assign((key: string) => `${namespace ?? ""}.${key}`, {
      rich: (key: string) => key,
      raw: () => ({}),
    }),
  getLocale: async () => "en",
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("./terminal", () => ({ Terminal: () => <div data-part="terminal" /> }));
vi.mock("./try-it", () => ({ TryIt: () => <div data-part="try-it" /> }));
vi.mock("@/components/studio-screenshot", () => ({ StudioScreenshot: () => <figure /> }));

const { Showcase } = await import("./showcase");
const { Proof } = await import("./proof");
const { Control } = await import("./control");
const { Loop } = await import("./loop");
const { FinalCta } = await import("./final-cta");
const { Marquee } = await import("./marquee");
const { Formats } = await import("./formats");

async function render(section: () => Promise<ReactNode>): Promise<Document> {
  const markup = renderToStaticMarkup(await section());
  return new DOMParser().parseFromString(markup, "text/html");
}

const REVEALED = {
  showcase: Showcase,
  how: Proof,
  formats: Formats,
  control: Control,
  loop: Loop,
} as const;

const REVEALED_SECTIONS = Object.keys(REVEALED) as ReadonlyArray<keyof typeof REVEALED>;

function revealIndex(element: Element | null | undefined): string | null {
  return element?.closest("[data-reveal]")?.getAttribute("data-reveal") ?? null;
}

describe("landing reveal marks", () => {
  it.each(REVEALED_SECTIONS)(
    "%s reveals its heading first, with no eyebrow above it",
    async (id) => {
      const doc = await render(REVEALED[id]);
      const heading = doc.querySelector("h2");
      expect(revealIndex(heading)).toBe("0");
      expect(heading?.previousElementSibling).toBeNull();
      expect(doc.querySelector(".vk-eyebrow")).toBeNull();
      const indexes = [...doc.querySelectorAll("[data-reveal]")].map((node) =>
        Number(node.getAttribute("data-reveal")),
      );
      expect(indexes.length).toBeGreaterThan(1);
      expect(Math.max(...indexes)).toBeLessThanOrEqual(5);
    },
  );

  it("ships no numbered eyebrow style, section index or eyebrow message", () => {
    const css = readFileSync(join(process.cwd(), "app/global.css"), "utf8");
    expect(css).not.toContain(".vk-eyebrow");
    const sections = readFileSync(join(process.cwd(), "lib/landing-sections.ts"), "utf8");
    expect(sections).not.toMatch(/NUMBERED_SECTIONS|sectionNumber/);
    for (const locale of ["en", "de", "es", "fr"]) {
      const messages = JSON.parse(
        readFileSync(join(process.cwd(), `messages/${locale}.json`), "utf8"),
      ) as { landing: Record<string, Record<string, unknown>> };
      for (const id of REVEALED_SECTIONS)
        expect(messages.landing[id]).not.toHaveProperty("eyebrow");
    }
  });

  it.each([
    ["showcase", ".vk-showcase"],
    ["formats", ".vk-formats"],
  ] as const)("reveals the %s demo as one block and nothing inside it", async (id, selector) => {
    const doc = await render(REVEALED[id]);
    const demo = doc.querySelector(selector);
    expect(demo?.getAttribute("data-reveal")).toBe("2");
    expect(demo?.querySelector("[data-reveal]")).toBeNull();
  });

  it("reveals the final call to action heading before its buttons", async () => {
    const doc = await render(FinalCta);
    expect(revealIndex(doc.querySelector("h2"))).toBe("0");
    expect(revealIndex(doc.querySelector("a"))).toBe("1");
  });

  it("reveals each loop row as one unit, so its text never trails its picture", async () => {
    const doc = await render(Loop);
    const rows = [...doc.querySelectorAll("[data-loop-row]")];
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row.getAttribute("data-reveal")).toBe("0");
      expect(row.querySelector("[data-reveal]")).toBeNull();
    }
  });

  it("never reveals the marquee or the FAQ", async () => {
    const marquee = await render(Marquee);
    expect(marquee.querySelector("[data-reveal]")).toBeNull();
    const faq = readFileSync(join(import.meta.dirname, "faq.tsx"), "utf8");
    expect(faq).not.toMatch(/data-reveal|\breveal\b/);
  });

  it("never reveals the hero, whose h1 is the largest paint", () => {
    const hero = readFileSync(join(import.meta.dirname, "../landing-hero.tsx"), "utf8");
    expect(hero).not.toContain("data-reveal");
  });
});
