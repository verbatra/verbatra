import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { i18n, type Locale } from "@/lib/i18n";
import {
  COMPARE_ROWS,
  COMPARE_TOOLS,
  type CompareRowId,
  type CompareTool,
  compareCell,
} from "@/lib/landing-compare";
import { countWords, isSpaceless } from "@/lib/word-count";

const NAMESPACES = [
  "topNav",
  "banner",
  "marquee",
  "lockDemo",
  "gate",
  "highlights",
  "features",
  "compare",
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

  it("labels every comparison row and holds copy only where a cell has some", () => {
    const rows = branch(landing("en"), "compare.rows");
    expect(Object.keys(rows)).toEqual([...COMPARE_ROWS]);
    for (const row of COMPARE_ROWS) {
      const keys = Object.keys(branch(rows, row)).filter((key) => key !== "detail");
      expect(keys[0]).toBe("label");
      expect(COMPARE_TOOLS.filter((tool) => keys.includes(tool))).toEqual(keys.slice(1));
    }
    expect(Object.keys(branch(landing("en"), "compare.columns"))).toEqual([
      "criterion",
      "manual",
      "lingoDetail",
      "manualDetail",
    ]);
  });

  const FRENCH_SPACING = /[\u0020\u00a0][;:?!\u00bb]|\u00ab[\u0020\u00a0]/;

  it("keeps French punctuation and guillemets off a line of their own in every non-legal namespace", () => {
    const path = fileURLToPath(new URL("../messages/fr.json", import.meta.url));
    const catalog = JSON.parse(readFileSync(path, "utf8")) as MessageTree;
    expect(Object.keys(catalog).sort()).toEqual([
      "compare",
      "docs",
      "landing",
      "legal",
      "notFound",
    ]);
    const trees = [
      landing("fr"),
      branch(catalog, "compare"),
      branch(catalog, "docs"),
      branch(catalog, "notFound"),
    ];
    for (const tree of trees)
      for (const [key, text] of leaves(tree)) expect(text, key).not.toMatch(FRENCH_SPACING);
    for (const loose of ["a :", "a\u00a0;", "b ?", "\u00ab x", "x \u00bb"])
      expect(loose).toMatch(FRENCH_SPACING);
    expect("a\u202f: \u00ab\u202fx\u202f\u00bb").not.toMatch(FRENCH_SPACING);
  });

  const VERDICT_WORDS = ["yes", "no", "partial", "unknown", "noneFound", "notApplicable"] as const;

  const FLAGGED_LONG_NOTES: ReadonlyArray<readonly [CompareRowId, CompareTool]> = [
    ["license", "lingo"],
    ["pricing", "weblate"],
    ["pricing", "crowdin"],
    ["providers", "tolgee"],
    ["providers", "crowdin"],
    ["ownKeys", "crowdin"],
    ["ci", "verbatra"],
    ["translatorUi", "lingo"],
    ["inContext", "lingo"],
    ["ownKeys", "lingo"],
    ["ci", "phrase"],
  ];

  const ALL_CELLS = COMPARE_ROWS.flatMap((row) =>
    COMPARE_TOOLS.map((tool) => [row, tool] as const),
  );

  interface CompareWordCaps {
    readonly verdict: number;
    readonly note: number;
    readonly flaggedNote: number;
    readonly value: number;
  }

  const SPACED_CAPS: CompareWordCaps = { verdict: 2, note: 8, flaggedNote: 10, value: 4 };
  const COMPARE_CAPS: Readonly<Record<Locale, CompareWordCaps>> = {
    en: SPACED_CAPS,
    de: SPACED_CAPS,
    es: SPACED_CAPS,
    fr: SPACED_CAPS,
  };

  const QUALIFIER_BREAK = /[,:;，：；、]/;

  function opensWithVerdict(note: string, vocabulary: readonly string[], locale: string): boolean {
    const text = note.toLowerCase();
    if (isSpaceless(locale))
      return vocabulary.some(
        (word) =>
          text.startsWith(word) &&
          (text.length === word.length || QUALIFIER_BREAK.test(text.charAt(word.length))),
      );
    const tokens = text.split(/\s+/);
    const first = tokens[0] ?? "";
    const leads = tokens.length === 1 || QUALIFIER_BREAK.test(first.charAt(first.length - 1));
    return leads && vocabulary.includes(first.replace(/[,:;.，：；、。]+$/, ""));
  }

  function cell(locale: string, row: CompareRowId, tool: CompareTool): MessageTree | undefined {
    const node = branch(landing(locale), `compare.rows.${row}`)[tool];
    return typeof node === "object" ? node : undefined;
  }

  it("keeps one verdict vocabulary of single short words in every locale", () => {
    for (const locale of i18n.languages) {
      const vocabulary = branch(landing(locale), "compare.verdicts");
      expect(Object.keys(vocabulary), locale).toEqual([...VERDICT_WORDS]);
      for (const [key, word] of leaves(vocabulary)) {
        expect(word, `${locale} ${key}`).not.toBe("");
        expect(countWords(word, locale), `${locale} ${key}`).toBeLessThanOrEqual(
          COMPARE_CAPS[locale].verdict,
        );
      }
      expect(new Set(leaves(vocabulary).map(([, word]) => word)).size, locale).toBe(
        VERDICT_WORDS.length,
      );
    }
  });

  it("gives a value to exactly the cells that show a value, and none to a verdict", () => {
    for (const [row, tool] of ALL_CELLS) {
      const node = cell("en", row, tool);
      if (compareCell(row, tool).kind === "value")
        expect(typeof node?.value, `${row}.${tool}`).toBe("string");
      else expect(node?.value, `${row}.${tool}`).toBeUndefined();
    }
  });

  for (const locale of i18n.languages) {
    it(`caps a ${locale} qualifier at ${COMPARE_CAPS[locale].note} words and the eleven flagged ones at ${COMPARE_CAPS[locale].flaggedNote}`, () => {
      const flagged = FLAGGED_LONG_NOTES.map(([row, tool]) => `${row}.${tool}`);
      const noted = ALL_CELLS.filter(
        ([row, tool]) => typeof cell("en", row, tool)?.note === "string",
      );
      for (const [row, tool] of noted) {
        const note = cell(locale, row, tool)?.note;
        expect(typeof note, `${locale} ${row}.${tool}`).toBe("string");
        const cap = flagged.includes(`${row}.${tool}`)
          ? COMPARE_CAPS[locale].flaggedNote
          : COMPARE_CAPS[locale].note;
        expect(countWords(String(note), locale), `${locale} ${row}.${tool}`).toBeLessThanOrEqual(
          cap,
        );
      }
    });

    it(`keeps a ${locale} value short and never opens a qualifier with a verdict word`, () => {
      const vocabulary = leaves(branch(landing(locale), "compare.verdicts")).map(([, word]) =>
        word.toLowerCase(),
      );
      for (const [row, tool] of ALL_CELLS) {
        const node = cell(locale, row, tool);
        const label = `${locale} ${row}.${tool}`;
        expect(countWords(String(node?.value ?? ""), locale), label).toBeLessThanOrEqual(
          COMPARE_CAPS[locale].value,
        );
        expect(opensWithVerdict(String(node?.note ?? ""), vocabulary, locale), label).toBe(false);
      }
    });
  }

  it("detects a verdict word that opens a qualifier, spaced or not", () => {
    expect(opensWithVerdict("Yes, with a plugin", ["yes", "no"], "en")).toBe(true);
    expect(opensWithVerdict("Yes with a plugin", ["yes", "no"], "en")).toBe(false);
    expect(opensWithVerdict("支持，需要配置", ["支持", "不支持"], "zh-CN")).toBe(true);
    expect(opensWithVerdict("不支持：需要配置", ["支持", "不支持"], "zh-CN")).toBe(true);
    expect(opensWithVerdict("支持配置", ["支持", "不支持"], "zh-CN")).toBe(false);
  });

  it("detects a leading verdict word in every spaceless locale that joins the list", () => {
    for (const locale of i18n.languages.filter(isSpaceless)) {
      const vocabulary = leaves(branch(landing(locale), "compare.verdicts")).map(([, word]) =>
        word.toLowerCase(),
      );
      expect(vocabulary.length, locale).toBeGreaterThan(0);
      for (const word of vocabulary)
        expect(opensWithVerdict(`${word}，x`, vocabulary, locale), `${locale} ${word}`).toBe(true);
    }
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
