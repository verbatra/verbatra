import { describe, expect, it } from "vitest";
import type { GlossaryTermView, GlossaryWriteResult } from "../shared/rpc/glossary.js";
import {
  ALL_LOCALES,
  buildTermEdit,
  deriveGlossaryWriteOutcome,
  draftFor,
  glossaryReadOnlyReason,
  hasPerLocaleData,
  isGlossaryEditable,
  parseRenderings,
  scopeValue,
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

    expect(outcome).toEqual({ kind: "error", message: "A glossary term must not be blank." });
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
      inherited: false,
      forbidden: [],
    });
  });

  it("shows a locale's resolved translation and every rendering it forbids", () => {
    expect(scopeValue(TERM, "de")).toEqual({
      translation: "Übersicht",
      inherited: false,
      forbidden: ["Instrumententafel", "Tafel"],
    });
  });

  it("treats a locale the term has nothing for as inheriting nothing", () => {
    expect(scopeValue(TERM, "it")).toEqual({
      translation: undefined,
      inherited: true,
      forbidden: [],
    });
  });
});

describe("parseRenderings", () => {
  it("splits on commas and new lines, trims, and drops blanks and repeats", () => {
    expect(parseRenderings(" Tafel, Brett\nTafel ,, ")).toEqual(["Tafel", "Brett"]);
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
