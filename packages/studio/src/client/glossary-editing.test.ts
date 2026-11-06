import { describe, expect, it } from "vitest";
import type { GlossaryTermView, GlossaryWriteResult } from "../shared/rpc/glossary.js";
import {
  ALL_LOCALES,
  buildTermEdit,
  deriveGlossaryWriteOutcome,
  draftFor,
  editEmptiesTerm,
  exceedsForbiddenCap,
  filterTerms,
  forbiddenRuleCount,
  glossaryReadOnlyReason,
  hasPerLocaleData,
  isGlossaryEditable,
  isRetryableWriteError,
  isTargetLocale,
  keptTermEntry,
  nextFocusSource,
  parseRenderings,
  scopeValue,
  termExistsInScope,
  termLoss,
} from "./glossary-editing.js";

const RESULT: GlossaryWriteResult = {
  indicator: { source: "file", path: "glossary.json" },
  version: 1,
  locales: ["de"],
  terms: [],
  doNotTranslate: [],
  redactedTerms: [],
};

const TERM: GlossaryTermView = {
  source: "Dashboard",
  target: "Dashboard",
  targets: { DE: "Übersicht" },
  forbidden: { DE: ["Instrumententafel"] },
  caseSensitive: false,
  note: "Start page",
  byLocale: {
    de: { target: "Übersicht", inherited: false, forbidden: ["Instrumententafel", "Tafel"] },
    fr: { target: "Dashboard", inherited: true, forbidden: [] },
  },
};

describe("deriveGlossaryWriteOutcome", () => {
  it("carries the new glossary through on success", () => {
    const outcome = deriveGlossaryWriteOutcome({ ok: true, result: RESULT });

    expect(outcome).toEqual({ kind: "success", glossary: RESULT });
  });

  it("maps a known error code to its plain copy rather than the raw message", () => {
    const outcome = deriveGlossaryWriteOutcome({
      ok: false,
      error: { code: "METHOD_RATE_LIMITED", message: "raw" },
    });

    expect(outcome.kind).toBe("error");
    expect(outcome.kind === "error" && outcome.message).toContain("Studio is limiting");
  });

  it("falls back to the server's own message for a code with no copy", () => {
    const outcome = deriveGlossaryWriteOutcome({
      ok: false,
      error: { code: "CONFIG_INVALID", message: "A glossary term must not be blank." },
    });

    expect(outcome).toEqual({
      kind: "error",
      message: "A glossary term must not be blank.",
      error: { code: "CONFIG_INVALID", message: "A glossary term must not be blank." },
    });
  });
});

describe("glossaryReadOnlyReason", () => {
  it("returns no reason for a file-backed glossary, which is the editable case", () => {
    expect(glossaryReadOnlyReason({ source: "file", path: "glossary.json" })).toBeUndefined();
    expect(isGlossaryEditable({ source: "file", path: "glossary.json" })).toBe(true);
  });

  it("explains an inline glossary by pointing at a JSON file, never at a conversion", () => {
    const reason = glossaryReadOnlyReason({ source: "inline" }) ?? "";

    expect(reason).toContain("inline");
    expect(reason).toContain("JSON file");
    expect(isGlossaryEditable({ source: "inline" })).toBe(false);
  });

  it("explains an absent glossary by describing how to create one", () => {
    const reason = glossaryReadOnlyReason({ source: "none" }) ?? "";

    expect(reason).toContain("no glossary yet");
    expect(reason).toContain("JSON file");
    expect(isGlossaryEditable({ source: "none" })).toBe(false);
  });
});

describe("scopeValue", () => {
  it("shows the translation for all locales in the all-locales scope, with nothing forbidden", () => {
    expect(scopeValue(TERM, ALL_LOCALES)).toEqual({
      translation: "Dashboard",
      inheritedFrom: undefined,
      forbidden: [],
    });
  });

  it("shows a locale's resolved translation and every rendering it forbids", () => {
    expect(scopeValue(TERM, "de")).toEqual({
      translation: "Übersicht",
      inheritedFrom: undefined,
      forbidden: ["Instrumententafel", "Tafel"],
    });
  });

  it("names where an inherited translation comes from", () => {
    expect(scopeValue(TERM, "fr").inheritedFrom).toBe("all locales");
    const regional: GlossaryTermView = {
      ...TERM,
      targets: { de: "Übersicht" },
      byLocale: { "de-AT": { target: "Übersicht", inherited: true, forbidden: [] } },
    };
    expect(scopeValue(regional, "de-AT").inheritedFrom).toBe("de");
  });

  it("treats a locale the term has nothing for as inheriting nothing", () => {
    expect(scopeValue(TERM, "it")).toEqual({
      translation: undefined,
      inheritedFrom: undefined,
      forbidden: [],
    });
  });
});

describe("parseRenderings", () => {
  it("splits on commas and new lines, trims, and drops blanks and repeats", () => {
    expect(parseRenderings(" Tafel, Brett\nTafel ,, ")).toEqual(["Tafel", "Brett"]);
  });

  it("splits on the Arabic comma too", () => {
    expect(parseRenderings("لوحة، قائمة ,  لوحة")).toEqual(["لوحة", "قائمة"]);
  });
});

describe("draftFor", () => {
  it("starts a locale draft from the term's own entry for that locale, whatever its case", () => {
    expect(draftFor(TERM, "de")).toEqual({
      translation: "Übersicht",
      forbidden: "Instrumententafel",
      note: "Start page",
      partOfSpeech: "",
      caseSensitive: false,
    });
  });

  it("starts an inherited locale with an empty translation", () => {
    expect(draftFor(TERM, "fr").translation).toBe("");
  });
});

describe("buildTermEdit", () => {
  it("returns nothing when the draft changes nothing", () => {
    expect(buildTermEdit(TERM, "de", draftFor(TERM, "de"))).toBeUndefined();
  });

  it("sends a changed locale translation and forbidden list with their locale", () => {
    const draft = { ...draftFor(TERM, "de"), translation: " Startseite ", forbidden: "Tafel" };
    expect(buildTermEdit(TERM, "de", draft)).toEqual({
      term: "Dashboard",
      translation: "Startseite",
      locale: "de",
      forbidden: ["Tafel"],
    });
  });

  it("clears a translation, a forbidden list, a note and a part of speech that were emptied", () => {
    const term = { ...TERM, partOfSpeech: "noun" };
    const draft = {
      ...draftFor(term, "de"),
      translation: "",
      forbidden: "",
      note: " ",
      partOfSpeech: "",
    };
    expect(buildTermEdit(term, "de", draft)).toEqual({
      term: "Dashboard",
      translation: null,
      locale: "de",
      forbidden: null,
      note: null,
      partOfSpeech: null,
    });
  });

  it("changes the shared translation and case sensitivity without a locale", () => {
    const draft = { ...draftFor(TERM, ALL_LOCALES), translation: "Board", caseSensitive: true };
    expect(buildTermEdit(TERM, ALL_LOCALES, draft)).toEqual({
      term: "Dashboard",
      translation: "Board",
      caseSensitive: true,
    });
  });

  it("sends a note change alone without a locale, even in a locale scope", () => {
    const draft = { ...draftFor(TERM, "de"), note: "Home" };
    expect(buildTermEdit(TERM, "de", draft)).toEqual({ term: "Dashboard", note: "Home" });
  });
});

describe("hasPerLocaleData", () => {
  it("is true for a term with a per-locale translation or forbidden list", () => {
    expect(hasPerLocaleData(TERM)).toBe(true);
    expect(hasPerLocaleData({ ...TERM, targets: {}, forbidden: {} })).toBe(false);
  });
});

describe("forbiddenRuleCount", () => {
  it("counts every forbidden rendering across locales", () => {
    expect(forbiddenRuleCount({ ...TERM, forbidden: { de: ["a", "b"], fr: ["c"] } })).toBe(3);
  });
});

describe("isTargetLocale", () => {
  it("matches a configured target locale regardless of case", () => {
    expect(isTargetLocale(["de", "fr"], "DE")).toBe(true);
    expect(isTargetLocale(["de", "fr"], "de-AT")).toBe(false);
  });
});

const ONLY_SHARED: GlossaryTermView = {
  source: "Shop",
  target: "Laden",
  targets: {},
  forbidden: {},
  caseSensitive: true,
  note: "Storefront",
  partOfSpeech: "noun",
  byLocale: {},
};

const ONLY_GERMAN: GlossaryTermView = {
  source: "Shop",
  targets: { DE: "Laden" },
  forbidden: {},
  caseSensitive: true,
  note: "Storefront",
  partOfSpeech: "noun",
  byLocale: {},
};

describe("editEmptiesTerm", () => {
  it("is true when clearing the shared translation leaves nothing else", () => {
    expect(editEmptiesTerm(ONLY_SHARED, { term: "Shop", translation: null })).toBe(true);
  });

  it("is false while a per-locale translation or rule remains", () => {
    expect(editEmptiesTerm(TERM, { term: "Dashboard", translation: null })).toBe(false);
    const ruleOnly = { ...ONLY_SHARED, forbidden: { de: ["x"] } };
    expect(editEmptiesTerm(ruleOnly, { term: "Shop", translation: null })).toBe(false);
  });

  it("is true when clearing a locale's last entry, whatever the case of its key", () => {
    expect(editEmptiesTerm(ONLY_GERMAN, { term: "Shop", locale: "de", translation: null })).toBe(
      true,
    );
  });

  it("is false when clearing a locale that is not the last entry", () => {
    const both = { ...ONLY_GERMAN, targets: { DE: "Laden", fr: "Boutique" } };
    expect(editEmptiesTerm(both, { term: "Shop", locale: "de", translation: null })).toBe(false);
  });

  it("counts clearing the last forbidden list in a locale as emptying", () => {
    const ruleOnly: GlossaryTermView = { ...ONLY_GERMAN, targets: {}, forbidden: { de: ["x"] } };
    expect(editEmptiesTerm(ruleOnly, { term: "Shop", locale: "de", forbidden: null })).toBe(true);
    expect(editEmptiesTerm(ruleOnly, { term: "Shop", locale: "de", forbidden: [] })).toBe(true);
    expect(editEmptiesTerm(ruleOnly, { term: "Shop", locale: "de", forbidden: ["y"] })).toBe(false);
  });

  it("is false for an edit that touches neither translation nor rules", () => {
    expect(editEmptiesTerm(ONLY_SHARED, { term: "Shop", note: null })).toBe(false);
  });
});

describe("termLoss", () => {
  it("lists every translation, the rule count, the note, the part of speech and the case flag", () => {
    expect(termLoss(TERM)).toEqual({
      translations: [
        { locale: undefined, value: "Dashboard" },
        { locale: "DE", value: "Übersicht" },
      ],
      forbiddenRules: 1,
      note: "Start page",
      partOfSpeech: undefined,
      caseSensitive: false,
    });
  });
});

describe("termExistsInScope", () => {
  const terms = [ONLY_SHARED, ONLY_GERMAN, { ...ONLY_SHARED, source: "shop" }];

  it("matches the source exactly, case included", () => {
    expect(termExistsInScope(terms, "Shop", ALL_LOCALES)).toBe(ONLY_SHARED);
    expect(termExistsInScope(terms, "SHOP", ALL_LOCALES)).toBeUndefined();
  });

  it("only counts a term that already holds a translation for the scope", () => {
    expect(termExistsInScope([ONLY_GERMAN], "Shop", ALL_LOCALES)).toBeUndefined();
    expect(termExistsInScope([ONLY_GERMAN], "Shop", "de")).toBe(ONLY_GERMAN);
    expect(termExistsInScope([ONLY_GERMAN], "Shop", "fr")).toBeUndefined();
  });
});

describe("keptTermEntry", () => {
  it("finds a do-not-translate entry by its exact term", () => {
    const entries = [{ term: "Northwind", caseSensitive: true }];
    expect(keptTermEntry(entries, "Northwind")).toBe(entries[0]);
    expect(keptTermEntry(entries, "northwind")).toBeUndefined();
  });
});

describe("filterTerms", () => {
  const terms = [TERM, ONLY_SHARED];

  it("returns every term for a blank query", () => {
    expect(filterTerms(terms, "   ")).toBe(terms);
  });

  it("matches the source, any translation, a forbidden rendering, the note and the part of speech", () => {
    expect(filterTerms(terms, "dash")).toEqual([TERM]);
    expect(filterTerms(terms, "übersicht")).toEqual([TERM]);
    expect(filterTerms(terms, "instrumenten")).toEqual([TERM]);
    expect(filterTerms(terms, "start page")).toEqual([TERM]);
    expect(filterTerms(terms, "NOUN")).toEqual([ONLY_SHARED]);
  });

  it("finds an Arabic value and returns nothing for a miss", () => {
    const arabic = { ...ONLY_SHARED, source: "Cart", target: "عربة التسوق {count}" };
    expect(filterTerms([arabic, TERM], "عربة")).toEqual([arabic]);
    expect(filterTerms(terms, "zzz")).toEqual([]);
  });
});

describe("nextFocusSource", () => {
  it("prefers the following term, then the previous one, then nothing", () => {
    expect(nextFocusSource(["a", "b", "c"], "b")).toBe("c");
    expect(nextFocusSource(["a", "b", "c"], "c")).toBe("b");
    expect(nextFocusSource(["a"], "a")).toBeUndefined();
    expect(nextFocusSource(["a"], "zzz")).toBeUndefined();
  });
});

describe("exceedsForbiddenCap", () => {
  it("allows exactly 50 distinct renderings and refuses 51", () => {
    const fifty = Array.from({ length: 50 }, (_, index) => `r${index}`).join(", ");
    expect(exceedsForbiddenCap(fifty)).toBe(false);
    expect(exceedsForbiddenCap(`${fifty}, extra`)).toBe(true);
  });

  it("does not count repeats or blanks", () => {
    expect(exceedsForbiddenCap(`${"a, ".repeat(80)}b`)).toBe(false);
  });
});

describe("isRetryableWriteError", () => {
  it("retries transient failures only", () => {
    for (const code of ["LOCK_CONTENDED", "METHOD_RATE_LIMITED", "INTERNAL", "NETWORK_ERROR"]) {
      expect(isRetryableWriteError({ code, message: "m" })).toBe(true);
    }
    expect(isRetryableWriteError({ code: "GLOSSARY_UNWRITABLE", message: "m" })).toBe(true);
    for (const code of ["CONFIG_INVALID", "PARAMS_INVALID", "GLOSSARY_NOT_FILE_BACKED"]) {
      expect(isRetryableWriteError({ code, message: "m" })).toBe(false);
    }
  });
});
