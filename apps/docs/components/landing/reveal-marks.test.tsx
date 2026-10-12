import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LANDING_SECTIONS, type LandingSectionId } from "@/lib/landing-sections";

const SECTION_FILES: Readonly<Record<LandingSectionId, string>> = {
  hero: "hero.tsx",
  proofStrip: "proof-strip.tsx",
  problem: "problem.tsx",
  howItWorks: "steps.tsx",
  features: "bento.tsx",
  code: "code-showcase.tsx",
  showcase: "showcase.tsx",
  ecosystem: "ecosystem.tsx",
  studio: "studio.tsx",
  compare: "compare.tsx",
  openSource: "open-source.tsx",
  faq: "faq.tsx",
  finalCta: "final-cta.tsx",
};

const REVEALED: ReadonlyArray<LandingSectionId> = [
  "problem",
  "howItWorks",
  "features",
  "code",
  "showcase",
];

function source(file: string): string {
  return readFileSync(join(import.meta.dirname, file), "utf8");
}

function revealMarks(file: string): ReadonlyArray<number> {
  return [...source(file).matchAll(/data-reveal="(\d)"/g)].map((match) => Number(match[1]));
}

describe("landing reveal marks", () => {
  it("maps every landing section to its file", () => {
    expect(Object.keys(SECTION_FILES)).toEqual([...LANDING_SECTIONS]);
  });

  it.each(REVEALED)("%s reveals only its demo, at most two blocks", (id) => {
    const marks = revealMarks(SECTION_FILES[id]);
    expect(marks.length).toBeGreaterThan(0);
    expect(marks.length).toBeLessThanOrEqual(2);
    expect(Math.min(...marks)).toBeGreaterThanOrEqual(2);
  });

  it.each(LANDING_SECTIONS.filter((id) => !REVEALED.includes(id)))(
    "%s never fades in, so the page does not rise section by section",
    (id) => {
      expect(source(SECTION_FILES[id])).not.toMatch(/data-reveal|\breveal\b/);
    },
  );

  it("never reveals a section heading", () => {
    expect(source("section-head.tsx")).not.toContain("data-reveal");
  });

  it("reveals the showcase playground as one block and nothing inside it", () => {
    expect(revealMarks("showcase.tsx")).toEqual([2]);
    expect(source("try-it.tsx")).not.toContain("data-reveal");
  });

  it("ships no numbered eyebrow style or section index", () => {
    const css = readFileSync(join(process.cwd(), "app/global.css"), "utf8");
    expect(css).not.toContain(".vk-eyebrow");
    const sections = readFileSync(join(process.cwd(), "lib/landing-sections.ts"), "utf8");
    expect(sections).not.toMatch(/NUMBERED_SECTIONS|sectionNumber/);
  });
});
