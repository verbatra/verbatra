import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LANDING_SECTIONS } from "@/lib/landing-sections";

function docsPath(relative: string): string {
  return fileURLToPath(new URL(`../${relative}`, import.meta.url));
}

describe("landing section order", () => {
  it("opens on the hero, the provider and format marquee, the SDK playground and the feature flow, then closes on the FAQ and the call to action", () => {
    expect(LANDING_SECTIONS).toEqual([
      "hero",
      "marquee",
      "playground",
      "flow",
      "proofStrip",
      "problem",
      "features",
      "code",
      "compare",
      "openSource",
      "faq",
      "finalCta",
    ]);
  });

  it("renders the page from the ordered list rather than a hand-placed sequence", () => {
    const page = readFileSync(docsPath("app/[lang]/(home)/page.tsx"), "utf8");
    expect(page).toContain("LANDING_SECTIONS.map(");
    for (const id of LANDING_SECTIONS) expect(page).toMatch(new RegExp(`^\\s+${id}: <`, "m"));
  });

  it("never renders a retired section beside the one that replaced it, so no section id collides", () => {
    const page = readFileSync(docsPath("app/[lang]/(home)/page.tsx"), "utf8");
    expect(page).not.toMatch(/components\/landing-hero"|components\/landing\/formats"/);
  });

  it.each([
    "gains",
    "providers",
    "reveal",
    "hero-demo",
    "showcase-tabs",
    "openai-icon",
    "ecosystem",
    "formats",
    "format-switch",
    "format-pane",
    "format-pane-frame",
    "steps",
    "showcase",
    "studio",
  ])("no longer ships the %s component", (name) => {
    expect(existsSync(docsPath(`components/landing/${name}.tsx`))).toBe(false);
  });
});
