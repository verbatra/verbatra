import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { i18n } from "@/lib/i18n";
import {
  COMPARE_ROWS,
  COMPARE_TOOLS,
  type CompareRowId,
  type CompareTool,
  compareCell,
} from "@/lib/landing-compare";

const NAMESPACES = [
  "topNav",
  "banner",
  "marquee",
  "lockDemo",
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

  const NOTE_CAP = 8;
  const FLAGGED_NOTE_CAP = 10;
  const VALUE_CAP = 4;

  function words(text: string): number {
    return text.split(/\s+/).filter((word) => word !== "").length;
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
        expect(words(word), `${locale} ${key}`).toBeLessThanOrEqual(2);
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
    it(`caps a ${locale} qualifier at ${NOTE_CAP} words and the eleven flagged ones at ${FLAGGED_NOTE_CAP}`, () => {
      const flagged = FLAGGED_LONG_NOTES.map(([row, tool]) => `${row}.${tool}`);
      const noted = ALL_CELLS.filter(
        ([row, tool]) => typeof cell("en", row, tool)?.note === "string",
      );
      for (const [row, tool] of noted) {
        const note = cell(locale, row, tool)?.note;
        expect(typeof note, `${locale} ${row}.${tool}`).toBe("string");
        const cap = flagged.includes(`${row}.${tool}`) ? FLAGGED_NOTE_CAP : NOTE_CAP;
        expect(words(String(note)), `${locale} ${row}.${tool}`).toBeLessThanOrEqual(cap);
      }
    });

    it(`keeps a ${locale} value short and never opens a qualifier with a verdict word`, () => {
      const vocabulary = leaves(branch(landing(locale), "compare.verdicts")).map(([, word]) =>
        word.toLowerCase(),
      );
      for (const [row, tool] of ALL_CELLS) {
        const node = cell(locale, row, tool);
        const label = `${locale} ${row}.${tool}`;
        expect(words(String(node?.value ?? "")), label).toBeLessThanOrEqual(VALUE_CAP);
        const tokens = String(node?.note ?? "").split(/\s+/);
        const first = tokens[0] ?? "";
        const leadsWithVerdict = tokens.length === 1 || /[,:;]$/.test(first);
        const opening = first.replace(/[,:;.]+$/, "").toLowerCase();
        expect(leadsWithVerdict && vocabulary.includes(opening), label).toBe(false);
      }
    });
  }

  it("names no sync command, which verbatra does not have", () => {
    for (const [key, text] of source) expect(text, key).not.toMatch(/verbatra sync\b/);
  });

  it("never breaks the closing heading at a hyphen", () => {
    for (const locale of i18n.languages) {
      expect(branch(landing(locale), "closing").heading, locale).not.toContain("-");
    }
  });
});
