import type { PlaceholderIntegrityResult } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import type { LocaleGlossary, LocaleGlossaryTerm } from "./glossary.js";
import { computeReviewFlags, type ReviewFlagInput } from "./review-flags.js";

const CLEAN_INTEGRITY: PlaceholderIntegrityResult = {
  matches: true,
  missing: [],
  extra: [],
  reordered: false,
};

function term(overrides: Partial<LocaleGlossaryTerm> & { source: string }): LocaleGlossaryTerm {
  return { forbidden: [], caseSensitive: false, ...overrides };
}

function glossary(
  terms: readonly LocaleGlossaryTerm[],
  doNotTranslate: LocaleGlossary["doNotTranslate"] = [],
): LocaleGlossary {
  return { terms, doNotTranslate };
}

function reasons(overrides: Partial<ReviewFlagInput>): readonly string[] {
  return (
    computeReviewFlags({
      sourceValue: "Open the dashboard",
      translatedValue: "Öffne die Übersicht",
      sourceLocale: "en",
      targetLocale: "de",
      integrity: CLEAN_INTEGRITY,
      ...overrides,
    })?.reasons ?? []
  );
}

describe("computeReviewFlags: GLOSSARY_FORBIDDEN_TERM", () => {
  const dashboard = glossary([
    term({ source: "Dashboard", target: "Übersicht", forbidden: ["Instrumententafel"] }),
  ]);

  it("flags a translation that uses a forbidden rendering", () => {
    expect(
      reasons({ translatedValue: "Öffne die Instrumententafel", glossary: dashboard }),
    ).toContain("GLOSSARY_FORBIDDEN_TERM");
  });

  it("does not flag a translation that uses the required rendering", () => {
    expect(reasons({ glossary: dashboard })).toEqual([]);
  });

  it("flags a forbidden rendering even when the term itself is absent from the source", () => {
    expect(
      reasons({
        sourceValue: "Open the panel",
        translatedValue: "Öffne die Instrumententafel",
        glossary: dashboard,
      }),
    ).toEqual(["GLOSSARY_FORBIDDEN_TERM"]);
  });

  it("does not flag a forbidden rendering the source itself contains", () => {
    expect(
      reasons({
        sourceValue: "Rename Instrumententafel to dashboard",
        translatedValue: "Benenne Instrumententafel in Übersicht um",
        glossary: dashboard,
      }),
    ).toEqual([]);
  });

  it.each([
    ["an unlisted compound", "Öffne die Instrumententafelansicht", false],
    ["an unlisted inflection", "Öffne die Instrumententafeln", false],
    ["a hyphenated compound", "Öffne die Instrumententafel-Ansicht", true],
    ["a different letter case", "Öffne die INSTRUMENTENTAFEL", true],
  ])("matches the forbidden rendering as a whole word: %s", (_label, translatedValue, flagged) => {
    expect(
      reasons({ translatedValue, glossary: dashboard }).includes("GLOSSARY_FORBIDDEN_TERM"),
    ).toBe(flagged);
  });

  it("respects case for a case-sensitive term", () => {
    const sensitive = glossary([
      term({ source: "Dashboard", target: "Übersicht", forbidden: ["Board"], caseSensitive: true }),
    ]);
    expect(reasons({ translatedValue: "Öffne die Übersicht board", glossary: sensitive })).toEqual(
      [],
    );
    expect(reasons({ translatedValue: "Öffne die Übersicht Board", glossary: sensitive })).toEqual([
      "GLOSSARY_FORBIDDEN_TERM",
    ]);
  });

  it("falls back to containment for a rendering in a script without word separators", () => {
    const japanese = glossary([term({ source: "server", target: "サーバー", forbidden: ["鯖"] })]);
    expect(
      reasons({
        sourceValue: "Restart the server",
        translatedValue: "サーバー鯖を再起動",
        targetLocale: "ja",
        glossary: japanese,
      }),
    ).toEqual(["GLOSSARY_FORBIDDEN_TERM"]);
  });

  it("reports both glossary reasons when a forbidden rendering replaces the required one", () => {
    expect(
      reasons({ translatedValue: "Öffne die Instrumententafel", glossary: dashboard }),
    ).toEqual(["GLOSSARY_TERM_MISSED", "GLOSSARY_FORBIDDEN_TERM"]);
  });
});

describe("computeReviewFlags: do-not-translate terms", () => {
  const brand = glossary([], [{ term: "verbatra", caseSensitive: true }]);

  it("flags a do-not-translate term the translation dropped", () => {
    expect(
      reasons({
        sourceValue: "Install verbatra today",
        translatedValue: "Installiere es heute",
        glossary: brand,
      }),
    ).toEqual(["GLOSSARY_TERM_MISSED"]);
  });

  it("flags a case-sensitive do-not-translate term whose case changed", () => {
    expect(
      reasons({
        sourceValue: "Install verbatra today",
        translatedValue: "Installiere Verbatra heute",
        glossary: brand,
      }),
    ).toEqual(["GLOSSARY_TERM_MISSED"]);
  });

  it("accepts a case-insensitive do-not-translate term in any case", () => {
    expect(
      reasons({
        sourceValue: "Install verbatra today",
        translatedValue: "Installiere VERBATRA heute",
        glossary: glossary([], [{ term: "verbatra", caseSensitive: false }]),
      }),
    ).toEqual([]);
  });

  it("does not expect a do-not-translate term the source does not contain", () => {
    expect(reasons({ glossary: brand })).toEqual([]);
  });
});

describe("computeReviewFlags: EQUALS_SOURCE with fixed terms", () => {
  it.each([
    ["a do-not-translate term", glossary([], [{ term: "verbatra", caseSensitive: true }])],
    [
      "a case-insensitive do-not-translate term",
      glossary([], [{ term: "VERBATRA", caseSensitive: false }]),
    ],
    ["a term translated to itself", glossary([term({ source: "verbatra", target: "verbatra" })])],
  ])("is not raised for a source made only of %s", (_label, fixed) => {
    expect(
      reasons({ sourceValue: "verbatra", translatedValue: "verbatra", glossary: fixed }),
    ).toEqual([]);
  });

  it("is still raised when the source has words beyond its fixed terms", () => {
    expect(
      reasons({
        sourceValue: "verbatra docs",
        translatedValue: "verbatra docs",
        glossary: glossary([], [{ term: "verbatra", caseSensitive: true }]),
      }),
    ).toEqual(["EQUALS_SOURCE"]);
  });

  it("only discounts a fixed term where it stands as a whole word", () => {
    expect(
      reasons({
        sourceValue: "verbatras",
        translatedValue: "verbatras",
        glossary: glossary([], [{ term: "verbatra", caseSensitive: true }]),
      }),
    ).toEqual(["EQUALS_SOURCE"]);
  });

  it("discounts every whole occurrence of a fixed term", () => {
    expect(
      reasons({
        sourceValue: "verbatra, verbatra!",
        translatedValue: "verbatra, verbatra!",
        glossary: glossary([], [{ term: "verbatra", caseSensitive: true }]),
      }),
    ).toEqual([]);
  });

  it("discounts a value covered by case-sensitive and case-insensitive terms together", () => {
    expect(
      reasons({
        sourceValue: "verbatra API",
        translatedValue: "verbatra API",
        glossary: glossary(
          [],
          [
            { term: "API", caseSensitive: true },
            { term: "VERBATRA", caseSensitive: false },
          ],
        ),
      }),
    ).toEqual([]);
  });

  it.each([
    ["a case-insensitive", false],
    ["a case-sensitive", true],
  ])("discounts %s term when case folding lengthens the value", (_label, caseSensitive) => {
    expect(
      reasons({
        sourceValue: "İstanbul",
        translatedValue: "İstanbul",
        glossary: glossary([], [{ term: "İstanbul", caseSensitive }]),
      }),
    ).toEqual([]);
  });

  it.each([
    ["en", "İstanbul API", "İstanbul"],
    ["tr", "I\u0307stanbul API", "istanbul"],
    ["lt", "\u00cctaka API", "\u00ccTAKA"],
  ])(
    "discounts a %s value whose case folding changes its length when two kinds of term cover it",
    (sourceLocale, value, caseInsensitiveTerm) => {
      expect(
        reasons({
          sourceValue: value,
          translatedValue: value,
          sourceLocale,
          glossary: glossary(
            [],
            [
              { term: "API", caseSensitive: true },
              { term: caseInsensitiveTerm, caseSensitive: false },
            ],
          ),
        }),
      ).not.toContain("EQUALS_SOURCE");
    },
  );

  it("is still raised when a letter outside a length-changing folded term stays uncovered", () => {
    expect(
      reasons({
        sourceValue: "İstanbul docs",
        translatedValue: "İstanbul docs",
        glossary: glossary([], [{ term: "İstanbul", caseSensitive: false }]),
      }),
    ).toEqual(["EQUALS_SOURCE"]);
  });

  it.each([
    ["ΟΔΟΣ", "οδος"],
    ["οδος", "ΟΔΟΣ"],
    ["ΟΔΟΣ", "ΟΔΟΣ"],
  ])("matches the case-insensitive Greek term %s in the value %s", (fixedTerm, value) => {
    expect(
      reasons({
        sourceValue: value,
        translatedValue: value,
        sourceLocale: "el",
        glossary: glossary([], [{ term: fixedTerm, caseSensitive: false }]),
      }),
    ).toEqual([]);
  });

  it("is still raised for an untranslated copy when the glossary has no fixed terms", () => {
    expect(
      reasons({
        sourceValue: "Dashboard",
        translatedValue: "Dashboard",
        glossary: glossary([term({ source: "Settings", target: "Einstellungen" })]),
      }),
    ).toEqual(["EQUALS_SOURCE"]);
  });
});

describe("computeReviewFlags: locale-aware case folding", () => {
  it("folds a Turkish dotted capital I by the target locale's rules", () => {
    expect(
      reasons({
        sourceValue: "Visit the city page",
        translatedValue: "İSTANBUL sayfasını ziyaret et",
        targetLocale: "tr",
        glossary: glossary([term({ source: "city", target: "istanbul" })]),
      }),
    ).toEqual([]);
  });

  it("falls back to locale-independent folding for a locale the runtime rejects", () => {
    expect(
      reasons({
        sourceValue: "Click Save",
        translatedValue: "Klicke SPEICHERN",
        targetLocale: "not_a_locale",
        glossary: glossary([term({ source: "Save", target: "Speichern" })]),
      }),
    ).toEqual([]);
  });
});

describe("computeReviewFlags: forbidden-only terms", () => {
  it("expects nothing of a term that only lists forbidden renderings", () => {
    expect(
      reasons({
        glossary: glossary([term({ source: "Dashboard", forbidden: ["Instrumententafel"] })]),
      }),
    ).toEqual([]);
  });
});
