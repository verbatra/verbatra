import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LANDING_SECTIONS, type LandingSectionId } from "@/lib/landing-sections";

const SECTION_FILES: Readonly<Record<LandingSectionId, string>> = {
  hero: "hero.tsx",
  marquee: "marquee.tsx",
  lockDemo: "lock-demo.tsx",
  gate: "gate.tsx",
  statement: "statement-band.tsx",
  features: "features.tsx",
  highlights: "highlights.tsx",
  compare: "comparison.tsx",
  faq: "faq.tsx",
  finalCta: "final-cta.tsx",
};

function source(file: string): string {
  return readFileSync(join(import.meta.dirname, file), "utf8");
}

const STILL_SECTIONS: ReadonlyArray<LandingSectionId> = ["hero", "marquee", "statement"];

const REVEALING_SECTIONS: ReadonlyArray<LandingSectionId> = LANDING_SECTIONS.filter(
  (id) => !STILL_SECTIONS.includes(id),
);

describe("landing reveal marks", () => {
  it("maps every landing section to its file", () => {
    expect(Object.keys(SECTION_FILES)).toEqual([...LANDING_SECTIONS]);
  });

  it.each(STILL_SECTIONS)(
    "%s never fades in: the first screen and the loop stay as they are",
    (id) => {
      expect(source(SECTION_FILES[id])).not.toMatch(/data-reveal|\breveal\b/);
    },
  );

  it("lists exactly the sections that carry artifacts to reveal", () => {
    expect(REVEALING_SECTIONS).toEqual([
      "lockDemo",
      "gate",
      "features",
      "highlights",
      "compare",
      "faq",
      "finalCta",
    ]);
    for (const id of REVEALING_SECTIONS)
      expect(source(SECTION_FILES[id]), id).toContain("data-reveal");
  });

  it("never marks a heading, a lead or a prose paragraph in any section", () => {
    for (const id of REVEALING_SECTIONS) {
      const file = source(SECTION_FILES[id]);
      expect(file, id).not.toMatch(/<(h[1-6]|p)\b[^>]*data-reveal/);
      expect(file, id).not.toMatch(/<SectionHead[^>]*reveal/);
    }
  });

  it.each(["hero", "marquee"] as const)("%s carries no word reveal", (id) => {
    expect(source(SECTION_FILES[id])).not.toMatch(/vk-words|splitWords/);
  });

  it("lets a heading carry the word reveal but never a reveal mark on top of it", () => {
    for (const file of ["section-head.tsx", "final-cta.tsx", "statement-band.tsx"]) {
      const text = source(file);
      expect(text, file).toMatch(/vk-words/);
      expect(text, file).not.toMatch(/<(h2|p)\b[^>]*data-reveal/);
    }
  });

  it("never reveals a section heading", () => {
    expect(source("section-head.tsx")).not.toContain("data-reveal");
  });

  it("ships no numbered eyebrow or section index, only the bracketed label", () => {
    const css = readFileSync(join(process.cwd(), "app/global.css"), "utf8");
    expect(css).not.toMatch(/counter-(increment|reset)|counter\(/);
    expect(css).toContain('.vk-eyebrow::before {\n  content: "{ " / "";');
    const sections = readFileSync(join(process.cwd(), "lib/landing-sections.ts"), "utf8");
    expect(sections).not.toMatch(/NUMBERED_SECTIONS|sectionNumber/);
  });
});
