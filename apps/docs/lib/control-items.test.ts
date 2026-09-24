import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CONTROL_GROUPS, controlHref } from "@/lib/control-items";
import { i18n, type Locale } from "@/lib/i18n";

const CONTENT = fileURLToPath(new URL("../content/docs", import.meta.url));

function findPage(dir: string, name: string): string | undefined {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findPage(path, name);
      if (found) return found;
    } else if (entry.name === name) {
      return path;
    }
  }
  return undefined;
}

function pageSource(page: string, locale: Locale): string {
  const segments = page.replace(/^\/docs\//, "").split("/");
  const slug = segments.at(-1) ?? "";
  const dir = segments.length > 1 ? join(CONTENT, ...segments.slice(0, -1)) : CONTENT;
  const name = locale === i18n.defaultLanguage ? `${slug}.mdx` : `${slug}.${locale}.mdx`;
  const path = findPage(dir, name);
  if (!path) throw new Error(`no ${name} under ${dir}`);
  return readFileSync(path, "utf8");
}

function headingSlugs(source: string): ReadonlyArray<string> {
  return [...source.matchAll(/^#{2,6} (.+)$/gm)].map((match) =>
    (match[1] as string)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .trim()
      .replace(/\s/g, "-"),
  );
}

const ITEMS = CONTROL_GROUPS.flatMap((group) => group.items);

describe("control section links", () => {
  for (const locale of i18n.languages) {
    it(`points every ${locale} link at a page and heading that exist`, () => {
      for (const item of ITEMS) {
        const slugs = headingSlugs(pageSource(item.page, locale));
        const anchor = item.anchors?.[locale];
        if (anchor !== undefined) expect(slugs, `${item.key} in ${locale}`).toContain(anchor);
      }
    });
  }

  it("prefixes the locale and appends the localized anchor", () => {
    const review = ITEMS.find((item) => item.key === "review");
    if (!review) throw new Error("review item missing");
    expect(controlHref("en", review)).toBe("/docs/the-lock-file#review-decisions");
    expect(controlHref("de", review)).toBe("/de/docs/the-lock-file#review-entscheidungen");
  });
});
