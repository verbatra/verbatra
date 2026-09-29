import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT_DIR = resolve(REPO_ROOT, "apps/docs/content/docs");

const SPELLED_COUNTS = {
  en: {
    numbers:
      "five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty",
    nouns: "formats|providers|commands|subcommands",
  },
  de: {
    numbers:
      "fünf|sechs|sieben|acht|neun|zehn|elf|zwölf|dreizehn|vierzehn|fünfzehn|sechzehn|siebzehn|achtzehn|neunzehn|zwanzig",
    nouns: "formaten?|providern?|anbietern?|befehlen?|unterbefehlen?|kommandos",
  },
  es: {
    numbers:
      "cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|dieciséis|diecisiete|dieciocho|diecinueve|veinte",
    nouns: "formatos|proveedores|comandos|subcomandos",
  },
  fr: {
    numbers:
      "cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|dix-sept|dix-huit|dix-neuf|vingt",
    nouns: "formats|fournisseurs|commandes|sous-commandes",
  },
};

function countPattern(locale) {
  const { numbers, nouns } = SPELLED_COUNTS[locale];
  return new RegExp(
    `(?<![\\p{L}-])(?:${numbers})\\s+(?:[\\p{L}-]+\\s+)?(?:${nouns})(?![\\p{L}-])`,
    "giu",
  );
}

function localeOf(file) {
  return /\.(de|es|fr)\.mdx$/.exec(file)?.[1] ?? "en";
}

function proseLines(source) {
  const lines = [];
  let fenced = false;
  for (const line of source.split("\n")) {
    if (/^\s*```/.test(line)) {
      fenced = !fenced;
    } else if (!fenced) {
      lines.push(line);
    }
  }
  return lines;
}

function spelledCounts(source, locale) {
  const pattern = countPattern(locale);
  return proseLines(source).flatMap((line) => [...line.matchAll(pattern)].map(([match]) => match));
}

const PAGES = readdirSync(CONTENT_DIR, { recursive: true, encoding: "utf8" })
  .filter((file) => file.endsWith(".mdx"))
  .sort();

describe("docs prose never spells out a registry size", () => {
  it("finds pages in every locale", () => {
    for (const locale of Object.keys(SPELLED_COUNTS)) {
      expect(PAGES.filter((file) => localeOf(file) === locale).length).toBeGreaterThan(40);
    }
  });

  it.each(PAGES)("%s names no count of formats, providers or commands", (file) => {
    const source = readFileSync(join(CONTENT_DIR, file), "utf8");

    expect(spelledCounts(source, localeOf(file))).toEqual([]);
  });
});

describe("the spelled-count rule", () => {
  it.each([
    ["en", "verbatra reads fourteen formats and translates through six providers."],
    ["en", "Fifteen commands do the work, including five hosted providers."],
    ["de", "Er deckt die fünf gehosteten Provider ab und liest vierzehn Formate."],
    ["es", "Se soportan catorce formatos y quince comandos."],
    ["fr", "Il embarque sept fournisseurs et quinze sous-commandes."],
  ])("flags a spelled registry size in %s: %s", (locale, sentence) => {
    expect(spelledCounts(sentence, locale).length).toBeGreaterThan(0);
  });

  it.each([
    ["en", "Two commands start the same server, and the four JSON formats share a parser."],
    ["en", "Pass it once, and the provider answers in seven seconds."],
    ["es", "Once se usa en inglés, pero dos formatos no se crean desde cero."],
    ["en", "```\nfourteen formats inside a code block\n```"],
  ])("leaves a small or unrelated count alone in %s: %s", (locale, sentence) => {
    expect(spelledCounts(sentence, locale)).toEqual([]);
  });
});
