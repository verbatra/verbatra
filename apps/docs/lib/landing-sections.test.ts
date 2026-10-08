import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LANDING_SECTIONS } from "@/lib/landing-sections";

function docsPath(relative: string): string {
  return fileURLToPath(new URL(`../${relative}`, import.meta.url));
}

describe("landing section order", () => {
  it("leads with the hero and closes on the call to action, in this order", () => {
    expect(LANDING_SECTIONS).toEqual([
      "hero",
      "how",
      "control",
      "marquee",
      "loop",
      "faq",
      "finalCta",
    ]);
  });

  it("renders the page from the ordered list rather than a hand-placed sequence", () => {
    const page = readFileSync(docsPath("app/[lang]/(home)/page.tsx"), "utf8");
    expect(page).toContain("LANDING_SECTIONS.map(");
    for (const id of LANDING_SECTIONS) expect(page).toMatch(new RegExp(`^\\s+${id}: <`, "m"));
  });

  it.each(["gains", "providers", "reveal"])("no longer ships the %s component", (name) => {
    expect(existsSync(docsPath(`components/landing/${name}.tsx`))).toBe(false);
  });
});
