import { existsSync, readdirSync, readFileSync } from "node:fs";
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

  it("serves unmatched URLs the global not-found page, since the root layout sits under the [lang] segment", () => {
    expect(nextConfig.experimental?.globalNotFound).toBe(true);
  });

  it("merges small client chunks, since every extra first-load request costs a round trip before the largest paint", () => {
    expect(nextConfig.experimental?.turbopackChunking).toEqual({
      minChunkSize: 200000,
      requestCost: 1000000,
    });
  });
});

const BUILT_APP = join(import.meta.dirname, ".next/server/app");

function firstLoadScripts(page: string): string[] {
  const html = readFileSync(join(BUILT_APP, page), "utf8");
  return [
    ...new Set(
      Array.from(html.matchAll(/<script[^>]*\bsrc="(\/_next\/static\/[^"]+\.js)"/g), (m) => m[1]),
    ),
  ];
}

describe.skipIf(!existsSync(join(BUILT_APP, "en.html")))("the built first load", () => {
  it.each([
    ["en.html", 9],
    ["en/docs.html", 11],
    ["en/docs/cli/translate.html", 11],
    ["en/privacy.html", 10],
  ])(
    "%s requests at most %i scripts, which the merged chunks keep below the default chunker's count",
    (page, budget) => {
      expect(firstLoadScripts(page).length).toBeLessThanOrEqual(budget);
    },
  );
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
