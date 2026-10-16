import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { i18n } from "@/lib/i18n";
import { LANDING_SHOWCASE_TABS } from "@/lib/landing-code";
import { SHORT_COLUMNS, SHORT_ROWS } from "@/lib/landing-compare";
import { FLOW_NODES } from "@/lib/landing-flow";

const NAMESPACES = [
  "topNav",
  "banner",
  "facts",
  "marquee",
  "playground",
  "flow",
  "stats",
  "problem",
  "bento",
  "code",
  "compare",
  "openSource",
  "closing",
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

  it("names one tab, caption and docs link per showcase sample", () => {
    for (const part of ["tabs", "captions", "links"]) {
      expect(Object.keys(branch(landing("en"), `code.${part}`))).toEqual([
        ...LANDING_SHOWCASE_TABS,
      ]);
    }
  });

  it("titles one flow node per flow snippet", () => {
    expect(Object.keys(branch(landing("en"), "flow.items"))).toEqual(
      FLOW_NODES.map((node) => node.id),
    );
  });

  it("labels every comparison row and cell the short table holds", () => {
    const rows = branch(landing("en"), "compare.rows");
    expect(Object.keys(rows)).toEqual([...SHORT_ROWS]);
    for (const row of SHORT_ROWS) {
      expect(Object.keys(branch(rows, row))).toEqual(["label", ...SHORT_COLUMNS]);
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
      for (const name of ["Crowdin", "Lokalise", "Phrase", "Verbatra", "Studio"])
        expect(concession, `${locale} ${name}`).toContain(name);
    }
  });

  it("never rates a competitor in a comparison cell", () => {
    const rows = branch(landing("en"), "compare.rows");
    for (const [key, text] of leaves(rows))
      expect(text, key).not.toMatch(/\b(better|worse|best|only tool|lacks)\b/i);
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
