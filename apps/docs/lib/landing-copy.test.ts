import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { i18n } from "@/lib/i18n";
import { COMPARE_ROWS, COMPARE_TOOLS, SHORT_COLUMNS, SHORT_ROWS } from "@/lib/landing-compare";

const NAMESPACES = [
  "topNav",
  "banner",
  "facts",
  "marquee",
  "playground",
  "compare",
  "openSource",
  "closing",
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

  it("labels every comparison row and holds one cell per tool, plus the hosted summary on short rows", () => {
    const rows = branch(landing("en"), "compare.rows");
    expect(Object.keys(rows)).toEqual([...COMPARE_ROWS]);
    const short: ReadonlyArray<string> = SHORT_ROWS;
    for (const row of COMPARE_ROWS) {
      expect(Object.keys(branch(rows, row))).toEqual([
        "label",
        ...COMPARE_TOOLS,
        ...(short.includes(row) ? ["hostedTms"] : []),
      ]);
    }
    expect(Object.keys(branch(landing("en"), "compare.columns"))).toEqual([
      "criterion",
      ...SHORT_COLUMNS,
    ]);
  });

  it("states where hosted platforms do more, in every locale", () => {
    for (const locale of i18n.languages) {
      const concession = branch(landing(locale), "compare").concession;
      expect(typeof concession).toBe("string");
      for (const name of ["Tolgee", "Crowdin", "Lokalise", "Phrase", "Verbatra", "Studio"])
        expect(concession, `${locale} ${name}`).toContain(name);
    }
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

  function ratingPattern(words: string): RegExp {
    return new RegExp(`(?<!\\p{L})(${words})(?!\\p{L})`, "iu");
  }

  const RATINGS: Readonly<Record<string, RegExp>> = {
    en: ratingPattern("better|worse|best|only tool|lacks"),
    de: ratingPattern("besser|schlechter|beste[nrs]?|einzige[ns]? Tool|fehlt"),
    es: ratingPattern("mejor|peor|única herramienta|carece"),
    fr: ratingPattern("meilleur|pire|seul outil|manque"),
  };

  const RATED: Readonly<Record<string, string>> = {
    en: "the only tool here",
    de: "das einzige Tool dafür",
    es: "la única herramienta",
    fr: "le seul outil",
  };

  it("catches a rating phrase in every locale, accented ones included", () => {
    for (const locale of i18n.languages) {
      expect(RATED[locale], locale).toMatch(RATINGS[locale] ?? /$^/);
    }
    expect("inmejorable").not.toMatch(RATINGS.es ?? /$^/);
  });

  for (const locale of i18n.languages) {
    it(`never rates a competitor in a ${locale} comparison cell or note`, () => {
      const rating = RATINGS[locale];
      if (!rating) throw new Error(`no rating words for ${locale}`);
      const rated = leaves(branch(landing(locale), "compare")).filter(([key]) =>
        /^(rows\.|brief\.|concession$|lead$)/.test(key),
      );
      expect(
        rated.some(([key]) => key.startsWith("brief.")),
        locale,
      ).toBe(true);
      for (const [key, text] of rated) expect(text, key).not.toMatch(rating);
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
