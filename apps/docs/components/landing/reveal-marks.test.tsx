import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LANDING_SECTIONS, type LandingSectionId } from "@/lib/landing-sections";

const SECTION_FILES: Readonly<Record<LandingSectionId, string>> = {
  hero: "hero.tsx",
  marquee: "marquee.tsx",
  playground: "playground.tsx",
  compare: "compare.tsx",
  faq: "faq.tsx",
  openSource: "open-source.tsx",
  finalCta: "final-cta.tsx",
};

function source(file: string): string {
  return readFileSync(join(import.meta.dirname, file), "utf8");
}

describe("landing reveal marks", () => {
  it("maps every landing section to its file", () => {
    expect(Object.keys(SECTION_FILES)).toEqual([...LANDING_SECTIONS]);
  });

  it.each(LANDING_SECTIONS)(
    "%s never fades in, so the page does not rise section by section",
    (id) => {
      expect(source(SECTION_FILES[id])).not.toMatch(/data-reveal|\breveal\b/);
    },
  );

  it("never reveals a section heading", () => {
    expect(source("section-head.tsx")).not.toContain("data-reveal");
  });

  it("ships no numbered eyebrow style or section index", () => {
    const css = readFileSync(join(process.cwd(), "app/global.css"), "utf8");
    expect(css).not.toContain(".vk-eyebrow");
    const sections = readFileSync(join(process.cwd(), "lib/landing-sections.ts"), "utf8");
    expect(sections).not.toMatch(/NUMBERED_SECTIONS|sectionNumber/);
  });
});
