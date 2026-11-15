import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match.js";
import { describe, expect, it } from "vitest";
import { i18n } from "@/lib/i18n";
import { localeAlternation, TRANSLATED_LOCALES } from "@/lib/locales";
import nextConfig, { DEFAULT_LOCALE_PREFIX_REDIRECTS, MOVED_DOCS_PAGES } from "./next.config.mjs";

describe("next.config", () => {
  it("keeps English URLs unprefixed, so /docs and /contact share the shape of /de", () => {
    expect(i18n.hideLocale).toBe("default-locale");
  });

  it("stays thenable, so Next awaits the fumadocs-mdx generation before typegen and build exit", () => {
    expect(typeof (nextConfig as { then?: unknown }).then).toBe("function");
  });

  it("limits agent-driven Next.js upgrade nudges to security releases", () => {
    expect(nextConfig.experimental?.agentUpgrade).toBe("security");
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

describe("the default locale prefix", () => {
  it("sends /en and every /en/ path permanently to the unprefixed URL in one hop", async () => {
    const redirects = (await nextConfig.redirects?.()) ?? [];
    expect(DEFAULT_LOCALE_PREFIX_REDIRECTS).toEqual([
      { source: `/${i18n.defaultLanguage}`, destination: "/", permanent: true },
      { source: `/${i18n.defaultLanguage}/:path+`, destination: "/:path+", permanent: true },
    ]);
    for (const redirect of DEFAULT_LOCALE_PREFIX_REDIRECTS)
      expect(redirects).toContainEqual(redirect);
  });

  it("matches no unprefixed English page, so the redirect cannot loop", () => {
    const [, prefixed] = DEFAULT_LOCALE_PREFIX_REDIRECTS;
    const pattern = new RegExp(`^${prefixed?.source.replace("/:path+", "/.+")}$`);
    for (const path of ["/", "/docs", "/docs/cli/check", "/contact", "/en-us"]) {
      expect(pattern.test(path), path).toBe(false);
    }
    expect(pattern.test("/en/docs")).toBe(true);
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
    new RegExp(`(^|/)${slug}(/index)?(\\.(${localeAlternation(TRANSLATED_LOCALES)}))?\\.mdx$`).test(
      file,
    ),
  );
}

describe("moved docs pages", () => {
  it("spells one move out literally, in every locale including zh-CN and pt-BR and as Markdown", async () => {
    const redirects = (await nextConfig.redirects?.()) ?? [];
    for (const redirect of [
      { source: "/docs/testing", destination: "/docs/translation-safety" },
      {
        source: "/:locale(de|es|fr|zh-CN|pt-BR)/docs/testing",
        destination: "/:locale/docs/translation-safety",
      },
      { source: "/docs/testing.md", destination: "/docs/translation-safety.md" },
      {
        source: "/:locale(de|es|fr|zh-CN|pt-BR)/docs/testing.md",
        destination: "/:locale/docs/translation-safety.md",
      },
    ]) {
      expect(redirects).toContainEqual({ ...redirect, permanent: true });
    }
  });

  const moves = Object.entries(MOVED_DOCS_PAGES);

  it.each(moves)(
    "matches /de/docs/%s but not /en/docs/%s through Next's own matcher",
    async (from) => {
      const redirects = (await nextConfig.redirects?.()) ?? [];
      const localized = redirects.find(
        (redirect) =>
          redirect.source === `/:locale(${localeAlternation(TRANSLATED_LOCALES)})/docs/${from}`,
      );
      const match = getPathMatch(localized?.source ?? "", {
        removeUnnamedParams: true,
        strict: true,
      });
      expect(match(`/de/docs/${from}`)).toEqual({ locale: "de" });
      expect(match(`/zh-CN/docs/${from}`)).toEqual({ locale: "zh-CN" });
      expect(match(`/pt-BR/docs/${from}`)).toEqual({ locale: "pt-BR" });
      expect(match(`/en/docs/${from}`)).toBe(false);
    },
  );

  it.each(moves)(
    "redirects /docs/%s permanently, in every locale and as Markdown",
    async (from, to) => {
      const redirects = (await nextConfig.redirects?.()) ?? [];
      const expected = [
        { source: `/docs/${from}`, destination: `/docs/${to}` },
        {
          source: `/:locale(${localeAlternation(TRANSLATED_LOCALES)})/docs/${from}`,
          destination: `/:locale/docs/${to}`,
        },
        { source: `/docs/${from}.md`, destination: `/docs/${to}.md` },
        {
          source: `/:locale(${localeAlternation(TRANSLATED_LOCALES)})/docs/${from}.md`,
          destination: `/:locale/docs/${to}.md`,
        },
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

describe("a locale code with a hyphen in a redirect source", () => {
  const source = `/:locale(${localeAlternation(["de", "zh-CN", "ja"])})/docs/old`;
  const nextOptions = { removeUnnamedParams: true, strict: true };

  it("leaves the hyphen unescaped, and Next's path-to-regexp still reads the group", () => {
    expect(localeAlternation(["zh-CN"])).toBe("zh-CN");
    expect(() => getPathMatch(source, nextOptions)).not.toThrow();
  });

  it("matches the same paths as the escaped spelling", () => {
    const escaped = getPathMatch(source.replace("zh-CN", "zh\\-CN"), nextOptions);
    const plain = getPathMatch(source, nextOptions);
    for (const path of ["/zh-CN/docs/old", "/zh/docs/old", "/zh-CNx/docs/old", "/ja/docs/old"])
      expect(plain(path), path).toEqual(escaped(path));
  });

  it("matches the exact code Next routes with, and captures it whole", () => {
    const match = getPathMatch(source, nextOptions);
    expect(match("/zh-CN/docs/old")).toEqual({ locale: "zh-CN" });
    expect(match("/ja/docs/old")).toEqual({ locale: "ja" });
    expect(match("/de/docs/old")).toEqual({ locale: "de" });
  });

  it("does not match a bare language, a longer code or another page", () => {
    const match = getPathMatch(source, nextOptions);
    expect(match("/zh/docs/old")).toBe(false);
    expect(match("/zh-CNx/docs/old")).toBe(false);
    expect(match("/zhXCN/docs/old")).toBe(false);
    expect(match("/zh-CN/docs/other")).toBe(false);
  });

  it("rejects the wrong case when Next matches case-sensitively", () => {
    const match = getPathMatch(source, { ...nextOptions, sensitive: true });
    expect(match("/zh-CN/docs/old")).toEqual({ locale: "zh-CN" });
    expect(match("/zh-cn/docs/old")).toBe(false);
  });

  it("leaves case-sensitive routing off, so the [lang] guard is what rejects a wrong-case code", () => {
    expect((nextConfig.experimental as { caseSensitiveRoutes?: boolean }).caseSensitiveRoutes).toBe(
      undefined,
    );
  });
});
