import { describe, expect, it } from "vitest";
import {
  type GlossaryDefinition,
  glossaryDefinitionSchema,
  glossaryForLocale,
  normalizeGlossary,
} from "./glossary.js";

const DASHBOARD: GlossaryDefinition = {
  version: 2,
  terms: [
    {
      source: "Dashboard",
      target: "Dashboard",
      targets: { de: "Übersicht", fr: "Tableau de bord", "de-CH": "Startseite" },
      forbidden: { de: ["Instrumententafel"], "de-AT": ["Armaturenbrett"] },
      note: "The start page after sign-in",
      partOfSpeech: "noun",
    },
    { source: "Save", targets: { fr: "Enregistrer" } },
  ],
  doNotTranslate: ["verbatra", { term: "Acme", caseSensitive: false }],
};

function issuesOf(definition: unknown): readonly string[] {
  const result = glossaryDefinitionSchema.safeParse(definition);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

describe("normalizeGlossary", () => {
  it("reads a version 1 map as terms whose translation applies to every locale", () => {
    expect(normalizeGlossary({ Save: "Speichern" })).toEqual({
      version: 1,
      terms: [
        { source: "Save", target: "Speichern", targets: {}, forbidden: {}, caseSensitive: false },
      ],
      doNotTranslate: [],
    });
  });

  it("keeps a version 1 term named __proto__ as a term", () => {
    const glossary = normalizeGlossary(Object.fromEntries([["__proto__", "Prototyp"]]));
    expect(glossary.terms.map((term) => term.source)).toEqual(["__proto__"]);
  });

  it("fills every default of a version 2 glossary", () => {
    const glossary = normalizeGlossary(DASHBOARD);
    expect(glossary.version).toBe(2);
    expect(glossary.terms[1]).toEqual({
      source: "Save",
      targets: { fr: "Enregistrer" },
      forbidden: {},
      caseSensitive: false,
    });
    expect(glossary.doNotTranslate).toEqual([
      { term: "verbatra", caseSensitive: true },
      { term: "Acme", caseSensitive: false },
    ]);
  });

  it("returns the same result for the same glossary object, and accepts its own output", () => {
    const first = normalizeGlossary(DASHBOARD);
    expect(normalizeGlossary(DASHBOARD)).toBe(first);
    expect(normalizeGlossary({ ...first, version: 2 })).toEqual({ ...first, version: 2 });
  });
});

describe("glossaryForLocale", () => {
  it("returns undefined without a glossary", () => {
    expect(glossaryForLocale(undefined, "de")).toBeUndefined();
  });

  it("returns undefined when nothing applies to the locale", () => {
    expect(
      glossaryForLocale(
        { version: 2, terms: [{ source: "Save", targets: { fr: "Enregistrer" } }] },
        "de",
      ),
    ).toBeUndefined();
  });

  it("gives each locale its own translation and leaves out terms that have none there", () => {
    expect(glossaryForLocale(DASHBOARD, "de")?.terms).toEqual([
      {
        source: "Dashboard",
        target: "Übersicht",
        forbidden: ["Instrumententafel"],
        caseSensitive: false,
        note: "The start page after sign-in",
        partOfSpeech: "noun",
      },
    ]);
    expect(glossaryForLocale(DASHBOARD, "fr")?.terms.map((term) => term.target)).toEqual([
      "Tableau de bord",
      "Enregistrer",
    ]);
  });

  it("falls back from the exact locale to its base language, then to the global translation", () => {
    expect(glossaryForLocale(DASHBOARD, "de-CH")?.terms[0]?.target).toBe("Startseite");
    expect(glossaryForLocale(DASHBOARD, "de-DE")?.terms[0]?.target).toBe("Übersicht");
    expect(glossaryForLocale(DASHBOARD, "it")?.terms[0]?.target).toBe("Dashboard");
  });

  it("holds a regional locale to both its own and its base language's forbidden renderings", () => {
    expect(glossaryForLocale(DASHBOARD, "de-AT")?.terms[0]?.forbidden).toEqual([
      "Armaturenbrett",
      "Instrumententafel",
    ]);
  });

  it("compares locale codes in canonical form, ignoring case", () => {
    const glossary: GlossaryDefinition = {
      version: 2,
      terms: [{ source: "Color", targets: { "zh-hant-tw": "顏色" } }],
    };
    expect(glossaryForLocale(glossary, "zh-Hant-TW")?.terms[0]?.target).toBe("顏色");
  });

  it("carries the do-not-translate terms into every locale", () => {
    expect(glossaryForLocale(DASHBOARD, "it")?.doNotTranslate).toHaveLength(2);
    expect(
      glossaryForLocale({ version: 2, terms: [], doNotTranslate: ["verbatra"] }, "ja"),
    ).toEqual({ terms: [], doNotTranslate: [{ term: "verbatra", caseSensitive: true }] });
  });

  it("keeps a version 1 term with an empty translation, as earlier releases sent it", () => {
    expect(glossaryForLocale({ Save: "" }, "de")?.terms[0]?.target).toBe("");
  });

  it("tolerates a locale code the runtime rejects by comparing it as written", () => {
    expect(glossaryForLocale(DASHBOARD, "not_a_locale")?.terms[0]?.target).toBe("Dashboard");
  });
});

describe("glossaryDefinitionSchema", () => {
  it("accepts a complete version 2 glossary", () => {
    expect(issuesOf(DASHBOARD)).toEqual([]);
  });

  it.each([
    [
      "a repeated term",
      {
        version: 2,
        terms: [
          { source: "A", target: "B" },
          { source: "A", target: "C" },
        ],
      },
      'repeats the term "A"',
    ],
    [
      "a term with nothing to say",
      { version: 2, terms: [{ source: "A", note: "context only" }] },
      'gives the term "A" no translation and no forbidden rendering',
    ],
    [
      "a forbidden rendering equal to the required one",
      { version: 2, terms: [{ source: "A", target: "B", forbidden: { de: ["B"] } }] },
      'forbids "B", which is also its required translation',
    ],
    [
      "a locale named twice",
      { version: 2, terms: [{ source: "A", targets: { de: "B", DE: "C" } }] },
      'names the locale "DE" twice',
    ],
    [
      "a do-not-translate term that is also a glossary term",
      { version: 2, terms: [{ source: "A", target: "B" }], doNotTranslate: ["A"] },
      'keeps "A" untranslated, but it is also a glossary term',
    ],
    [
      "a repeated do-not-translate term",
      { version: 2, terms: [], doNotTranslate: ["A", { term: "A" }] },
      'repeats the term "A"',
    ],
  ])("refuses %s", (_label, definition, message) => {
    expect(issuesOf(definition)).toContain(message);
  });

  it.each([
    ["a blank target", { version: 2, terms: [{ source: "A", target: "  " }] }],
    ["an invalid locale", { version: 2, terms: [{ source: "A", targets: { german: "B" } }] }],
    ["an unknown field", { version: 2, terms: [{ source: "A", target: "B", forbiden: {} }] }],
    ["an empty forbidden list", { version: 2, terms: [{ source: "A", forbidden: { de: [] } }] }],
    ["another version", { version: 3, terms: [] }],
  ])("refuses %s", (_label, definition) => {
    expect(issuesOf(definition).length).toBeGreaterThan(0);
  });
});
