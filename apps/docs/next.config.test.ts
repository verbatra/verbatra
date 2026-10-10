import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { i18n } from "@/lib/i18n";
import nextConfig, { MOVED_DOCS_PAGES } from "./next.config.mjs";

describe("next.config", () => {
  it("keeps English URLs unprefixed, so /docs and /contact share the shape of /de", () => {
    expect(i18n.hideLocale).toBe("default-locale");
  });

  it("turns off optimistic routing, which would predict /docs as the [lang] home route after a switch from /de and prefetch segments that 404", () => {
    expect(nextConfig.experimental?.optimisticRouting).toBe(false);
  });
});

const CONTENT_DIR = join(import.meta.dirname, "content/docs");

function docsPageFiles(slug: string): string[] {
  return readdirSync(CONTENT_DIR, { recursive: true, encoding: "utf8" }).filter((file) =>
    new RegExp(`(^|/)${slug}(/index)?(\\.(de|es|fr))?\\.mdx$`).test(file),
  );
}

describe("moved docs pages", () => {
  const moves = Object.entries(MOVED_DOCS_PAGES);

  it.each(moves)(
    "redirects /docs/%s permanently, in every locale and as Markdown",
    async (from, to) => {
      const redirects = (await nextConfig.redirects?.()) ?? [];
      const expected = [
        { source: `/docs/${from}`, destination: `/docs/${to}` },
        { source: `/:locale(de|es|fr)/docs/${from}`, destination: `/:locale/docs/${to}` },
        { source: `/docs/${from}.md`, destination: `/docs/${to}.md` },
        { source: `/:locale(de|es|fr)/docs/${from}.md`, destination: `/:locale/docs/${to}.md` },
      ];
      for (const redirect of expected) {
        expect(redirects).toContainEqual({ ...redirect, permanent: true });
      }
    },
  );

  it.each(moves)("leaves no page at /docs/%s and one page per locale at its target", (from, to) => {
    expect(docsPageFiles(from)).toEqual([]);
    expect(docsPageFiles(to)).toHaveLength(i18n.languages.length);
  });
});
