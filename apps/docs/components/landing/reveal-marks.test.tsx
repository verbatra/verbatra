import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LANDING_SECTIONS, type LandingSectionId } from "@/lib/landing-sections";

const SECTION_FILES: Readonly<Record<LandingSectionId, string>> = {
  hero: "hero.tsx",
  marquee: "marquee.tsx",
  lockDemo: "lock-demo.tsx",
  gate: "gate.tsx",
  highlights: "highlights.tsx",
  features: "features.tsx",
  faq: "faq.tsx",
  finalCta: "final-cta.tsx",
};

function source(file: string): string {
  return readFileSync(join(import.meta.dirname, file), "utf8");
}

const REVEALING_SECTIONS: ReadonlyArray<LandingSectionId> = ["gate", "highlights"];

describe("landing reveal marks", () => {
  it("maps every landing section to its file", () => {
    expect(Object.keys(SECTION_FILES)).toEqual([...LANDING_SECTIONS]);
  });

  it.each(LANDING_SECTIONS.filter((id) => !REVEALING_SECTIONS.includes(id)))(
    "%s never fades in, so the page does not rise section by section",
    (id) => {
      expect(source(SECTION_FILES[id])).not.toMatch(/data-reveal|\breveal\b/);
    },
  );

  it("lets only the allowlisted sections reveal, each on its panes and never on a heading", () => {
    for (const id of REVEALING_SECTIONS) {
      const file = source(SECTION_FILES[id]);
      expect(file, id).toContain("data-reveal");
      expect(file, id).not.toMatch(/<h[23][^>]*data-reveal/);
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
