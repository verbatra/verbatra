import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { i18n } from "@/lib/i18n";

const CONTENT_DIR = join(import.meta.dirname, "../content");
const TRANSLATED = /\.(de|es|fr)\.(mdx|json)$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const INLINE_CODE = /(`+)[^`][\s\S]*?\1|(`+)/g;
const LINK_TARGET = /(?:\]\(\s*|\bhref="|^\s*\[[^\]]+\]:\s*)(\/[^\s)"'#?]*)/g;
const PROP_TARGET = /\bhref: "(\/[^"#?]*)/g;
const DOCS_PATH = /^(?:\/([a-z]{2}))?\/docs(?:\/|$)/;

type TranslatedFile = { name: string; locale: string; source: string };

function translatedFiles(): TranslatedFile[] {
  return readdirSync(CONTENT_DIR, { recursive: true, encoding: "utf8" }).flatMap((name) => {
    const locale = TRANSLATED.exec(name)?.[1];
    return locale === undefined
      ? []
      : [{ name, locale, source: readFileSync(join(CONTENT_DIR, name), "utf8") }];
  });
}

function closesFence(line: string, open: string): boolean {
  const fence = FENCE.exec(line)?.[1];
  return (
    fence !== undefined &&
    fence[0] === open[0] &&
    fence.length >= open.length &&
    line.trim() === fence
  );
}

function proseLines(source: string): string[] {
  const lines: string[] = [];
  let openFence: string | undefined;
  for (const line of source.split("\n")) {
    if (openFence !== undefined) {
      if (closesFence(line, openFence)) openFence = undefined;
      continue;
    }
    openFence = FENCE.exec(line)?.[1];
    if (openFence === undefined) lines.push(line.replace(INLINE_CODE, ""));
  }
  return lines;
}

function targets(source: string, pattern: RegExp): string[] {
  return proseLines(source).flatMap((line) =>
    [...line.matchAll(pattern)].map((match) => match[1] ?? ""),
  );
}

function docsLocale(href: string): string | null {
  const match = DOCS_PATH.exec(href);
  if (match === null) return null;
  return match[1] ?? i18n.defaultLanguage;
}

const FILES = translatedFiles();

describe("translated docs links", () => {
  it("finds translated pages and meta files in every non-default locale", () => {
    for (const locale of i18n.languages.filter((lang) => lang !== i18n.defaultLanguage)) {
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
