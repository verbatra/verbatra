import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TITLE_SUFFIX } from "./social-metadata";

const CONTENT_DIR = join(import.meta.dirname, "../content/docs");
const TITLE_RANGE = { min: 50, max: 60 } as const;
const DESCRIPTION_MAX = 160;

function frontmatterField(source: string, field: string): string | undefined {
  const frontmatter = /^---\n([\s\S]*?)\n---/.exec(source)?.[1] ?? "";
  const raw = new RegExp(`^${field}: (.+)$`, "m").exec(frontmatter)?.[1]?.trim();
  if (raw === undefined) return undefined;
  return raw.startsWith('"') ? (JSON.parse(raw) as string) : raw;
}

const pages = readdirSync(CONTENT_DIR, { recursive: true, encoding: "utf8" })
  .filter((file) => file.endsWith(".mdx"))
  .sort()
  .map((file) => {
    const source = readFileSync(join(CONTENT_DIR, file), "utf8");
    const title = frontmatterField(source, "title") ?? "";
    return {
      file,
      documentTitle: `${frontmatterField(source, "seoTitle") ?? title}${TITLE_SUFFIX}`,
      description: frontmatterField(source, "description") ?? "",
    };
  });

describe("docs search snippets", () => {
  it.each(pages)(
    "$file has a document title of 50 to 60 characters, so a search result shows it whole",
    ({ documentTitle }) => {
      expect(documentTitle.length).toBeGreaterThanOrEqual(TITLE_RANGE.min);
      expect(documentTitle.length).toBeLessThanOrEqual(TITLE_RANGE.max);
    },
  );

  it.each(pages)("$file has a description of at most 160 characters", ({ description }) => {
    expect(description.length).toBeGreaterThan(0);
    expect(description.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
  });
});
