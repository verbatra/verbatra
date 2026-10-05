import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SKILLS_PACK_ANCHORS, SKILLS_PACK_PAGE } from "@/components/landing/links";
import { i18n } from "@/lib/i18n";

const AGENTS_DIR = fileURLToPath(new URL("../content/docs/(agents)/", import.meta.url));

function headingSlugs(source: string): ReadonlyArray<string> {
  return [...source.matchAll(/^#{2,6} (.+)$/gm)].map((match) =>
    (match[1] as string)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .trim()
      .replace(/\s/g, "-"),
  );
}

describe("the landing skills link", () => {
  it("points at the agent recipes page", () => {
    expect(SKILLS_PACK_PAGE).toBe("/docs/agent-recipes");
  });

  for (const locale of i18n.languages) {
    it(`lands on the skills pack heading in ${locale}`, () => {
      const suffix = locale === i18n.defaultLanguage ? "" : `.${locale}`;
      const source = readFileSync(`${AGENTS_DIR}agent-recipes${suffix}.mdx`, "utf8");
      expect(headingSlugs(source)).toContain(SKILLS_PACK_ANCHORS[locale]);
    });
  }
});
