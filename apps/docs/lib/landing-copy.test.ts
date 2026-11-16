import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { i18n, type Locale } from "@/lib/i18n";
import { COMPARISON_ROWS, COMPARISON_VENDOR_NAMES } from "@/lib/landing-comparison";
import { countWords } from "@/lib/word-count";

const NAMESPACES = [
  "topNav",
  "banner",
  "marquee",
  "lockDemo",
  "gate",
  "highlights",
  "features",
  "comparison",
  "openSource",
  "closing",
  "footer",
  "fab",
] as const;

const BUZZWORDS =
  /\b(supercharge|seamless|revolutioni[sz]e|unlock|effortless|powerful|blazing|game.?changer|cutting.?edge)/i;

type MessageTree = { [key: string]: string | MessageTree };

function landing(locale: string): MessageTree {
  const path = fileURLToPath(new URL(`../messages/${locale}.json`, import.meta.url));
  const tree = (JSON.parse(readFileSync(path, "utf8")) as MessageTree).landing;
  if (typeof tree !== "object") throw new Error(`no landing namespace in ${locale}.json`);
  return tree;
}

function branch(tree: MessageTree, path: string): MessageTree {
  const node = path
    .split(".")
    .reduce<string | MessageTree | undefined>(
      (current, key) => (typeof current === "object" ? current[key] : undefined),
      tree,
    );
  if (typeof node !== "object") throw new Error(`no landing.${path}`);
  return node;
}

function leaves(tree: MessageTree, prefix = ""): ReadonlyArray<[string, string]> {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "string" ? [[path, value] as [string, string]] : leaves(value, path);
  });
}

function newCopy(locale: string): ReadonlyArray<[string, string]> {
  const tree = landing(locale);
  return NAMESPACES.flatMap((namespace) => leaves(branch(tree, namespace), namespace));
}

const source = newCopy(i18n.defaultLanguage);

describe("the redesigned landing copy", () => {
  for (const locale of i18n.languages.filter((lang) => lang !== i18n.defaultLanguage)) {
    it(`${locale} holds exactly the source keys`, () => {
      expect(newCopy(locale).map(([key]) => key)).toEqual(source.map(([key]) => key));
    });

    it(`${locale} keeps every ICU argument of the source`, () => {
      const args = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(([, name]) => name);
      const translated = new Map(newCopy(locale));
      for (const [key, text] of source)
        expect(args(translated.get(key) ?? ""), key).toEqual(args(text));
    });
  }

  it("uses no buzzwords in any locale", () => {
    for (const locale of i18n.languages) {
      for (const [key, text] of newCopy(locale))
        expect(text, `${locale} ${key}`).not.toMatch(BUZZWORDS);
    }
  });

  interface ComparisonWordCaps {
    readonly verdict: number;
    readonly column: number;
    readonly row: number;
    readonly checked: number;
  }

  const SPACED_COMPARISON_CAPS: ComparisonWordCaps = { verdict: 2, column: 2, row: 8, checked: 4 };
  const COMPARISON_CAPS: Readonly<Record<Locale, ComparisonWordCaps>> = {
    en: SPACED_COMPARISON_CAPS,
    de: SPACED_COMPARISON_CAPS,
    es: SPACED_COMPARISON_CAPS,
    fr: SPACED_COMPARISON_CAPS,
    "zh-CN": { verdict: 3, column: 4, row: 16, checked: 6 },
    "pt-BR": SPACED_COMPARISON_CAPS,
    ja: { verdict: 4, column: 5, row: 20, checked: 8 },
  };

  it("labels exactly the six comparison rows, in the order of the data", () => {
    expect(Object.keys(branch(landing("en"), "comparison.rows"))).toEqual([...COMPARISON_ROWS]);
    expect(Object.keys(branch(landing("en"), "comparison.verdicts"))).toEqual([
      "yes",
      "partial",
      "no",
    ]);
  });

  for (const locale of i18n.languages) {
    it(`caps ${locale} comparison verdicts, column labels, row labels and the checked line`, () => {
      const copy = branch(landing(locale), "comparison");
      const caps = COMPARISON_CAPS[locale];
      for (const [key, word] of leaves(branch(copy, "verdicts")))
        expect(countWords(word, locale), `${locale} ${key}`).toBeLessThanOrEqual(caps.verdict);
      for (const [key, label] of leaves(branch(copy, "columns")))
        expect(countWords(label, locale), `${locale} ${key}`).toBeLessThanOrEqual(caps.column);
      for (const [key, label] of leaves(branch(copy, "rows")))
        expect(countWords(label, locale), `${locale} ${key}`).toBeLessThanOrEqual(caps.row);
      expect(
        countWords(String(copy.lastChecked).replace("{date}", ""), locale),
      ).toBeLessThanOrEqual(caps.checked);
    });

    it(`names every compared tool in the ${locale} table caption`, () => {
      const caption = String(branch(landing(locale), "comparison").caption);
      for (const name of Object.values(COMPARISON_VENDOR_NAMES))
        expect(caption, `${locale} ${name}`).toContain(name);
    });

    it(`keeps one distinct ${locale} word for each comparison verdict`, () => {
      const words = leaves(branch(landing(locale), "comparison.verdicts")).map(([, word]) => word);
      expect(new Set(words).size, locale).toBe(3);
    });
  }

  const FRENCH_SPACING = /[\u0020\u00a0][;:?!\u00bb]|\u00ab[\u0020\u00a0]/;

  it("keeps French punctuation and guillemets off a line of their own in every non-legal namespace", () => {
    const path = fileURLToPath(new URL("../messages/fr.json", import.meta.url));
    const catalog = JSON.parse(readFileSync(path, "utf8")) as MessageTree;
    expect(Object.keys(catalog).sort()).toEqual([
      "analyticsPrompt",
      "docs",
      "landing",
      "legal",
      "notFound",
    ]);
    const trees = [
      landing("fr"),
      branch(catalog, "analyticsPrompt"),
      branch(catalog, "docs"),
      branch(catalog, "notFound"),
    ];
    for (const tree of trees)
      for (const [key, text] of leaves(tree)) expect(text, key).not.toMatch(FRENCH_SPACING);
    for (const loose of ["a :", "a\u00a0;", "b ?", "\u00ab x", "x \u00bb"])
      expect(loose).toMatch(FRENCH_SPACING);
    expect("a\u202f: \u00ab\u202fx\u202f\u00bb").not.toMatch(FRENCH_SPACING);
  });

  it("names no sync command, which verbatra does not have", () => {
    for (const [key, text] of source) expect(text, key).not.toMatch(/verbatra sync\b/);
  });

  it("never breaks the closing heading at a hyphen", () => {
    for (const locale of i18n.languages) {
      expect(branch(landing(locale), "closing").heading, locale).not.toContain("-");
    }
  });
});
