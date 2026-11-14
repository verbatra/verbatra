import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { i18n } from "@/lib/i18n";
import { localeAlternation, TRANSLATED_LOCALES } from "@/lib/locales";
import { mapProse } from "@/lib/markdown-links";

const CONTENT_DIR = join(import.meta.dirname, "../content");
const TRANSLATED = new RegExp(`\\.(${localeAlternation(TRANSLATED_LOCALES)})\\.(mdx|json)$`);
const LINK_TARGET = /(?:\]\(\s*|\bhref="|^\s*\[[^\]]+\]:\s*)(\/[^\s)"'#?]*)/g;
const PROP_TARGET = /\bhref: "(\/[^"#?]*)/g;
const DOCS_PATH = /^(?:\/([A-Za-z]{2}(?:-[A-Za-z]{2})?))?\/docs(?:\/|$)/;

type TranslatedFile = { name: string; locale: string; source: string };

function translatedFiles(): TranslatedFile[] {
  return readdirSync(CONTENT_DIR, { recursive: true, encoding: "utf8" }).flatMap((name) => {
    const locale = TRANSLATED.exec(name)?.[1];
    return locale === undefined
      ? []
      : [{ name, locale, source: readFileSync(join(CONTENT_DIR, name), "utf8") }];
  });
}

function targets(source: string, pattern: RegExp): string[] {
  const found: string[] = [];
  mapProse(source, (text) => {
    found.push(...[...text.matchAll(pattern)].map((match) => match[1] ?? ""));
    return text;
  });
  return found;
}

function docsLocale(href: string): string | null {
  const match = DOCS_PATH.exec(href);
  if (match === null) return null;
  return match[1] ?? i18n.defaultLanguage;
}

const FILES = translatedFiles();

describe("translated docs links", () => {
  it("finds translated pages and meta files in every non-default locale", () => {
    for (const locale of TRANSLATED_LOCALES) {
      expect(FILES.some((file) => file.locale === locale && file.name.endsWith(".mdx"))).toBe(true);
      expect(FILES.some((file) => file.locale === locale && file.name.endsWith(".json"))).toBe(
        true,
      );
    }
  });

  it.each(FILES.map((file) => [file.name, file] as const))(
    "%s links to docs pages in its own locale",
    (_name, file) => {
      const foreign = targets(file.source, LINK_TARGET).filter((href) => {
        const locale = docsLocale(href);
        return locale !== null && locale !== file.locale;
      });
      expect(foreign).toEqual([]);
    },
  );

  it.each(FILES.map((file) => [file.name, file] as const))(
    "%s leaves card prop hrefs unprefixed, since DocsHomePaths and DocsHomeFeatures prefix them",
    (_name, file) => {
      const prefixed = targets(file.source, PROP_TARGET).filter(
        (href) => docsLocale(href) !== null && docsLocale(href) !== i18n.defaultLanguage,
      );
      expect(prefixed).toEqual([]);
    },
  );
});
