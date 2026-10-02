import { describe, expect, it } from "vitest";
import {
  deriveKeyValueContext,
  draftCheckFor,
  draftFixedTermFlags,
  draftTermFlags,
  hasGlossaryHits,
} from "./key-value-context.js";

const NO_GLOSSARY = { terms: [], doNotTranslate: [] };

describe("deriveKeyValueContext", () => {
  it("reports loaded with the source, target, description, provenance, and glossary hits", () => {
    const glossary = {
      terms: [{ source: "cart", target: "Warenkorb", forbidden: [], caseSensitive: false }],
      doNotTranslate: [],
    };
    const context = deriveKeyValueContext({
      ok: true,
      result: {
        source: "Hello cart",
        target: "Hallo Warenkorb",
        description: "Greets the shopper",
        provenance: { origin: "human", reviewState: "unreviewed" },
        glossary,
      },
    });
    expect(context).toEqual({
      kind: "loaded",
      source: "Hello cart",
      target: "Hallo Warenkorb",
      description: "Greets the shopper",
      provenance: { origin: "human", reviewState: "unreviewed" },
      glossary,
      maxLength: undefined,
    });
  });

  it("preserves an absent target as undefined, never coercing it to an empty string", () => {
    const context = deriveKeyValueContext({
      ok: true,
      result: { source: "Hello", glossary: NO_GLOSSARY },
    });
    expect(context).toMatchObject({ kind: "loaded", source: "Hello", target: undefined });
    expect(context.kind === "loaded" && "target" in context).toBe(true);
  });

  it("reports error with the message for a transport or domain-error response", () => {
    const context = deriveKeyValueContext({
      ok: false,
      error: { code: "UNKNOWN_KEY", message: "The key was not found." },
    });
    expect(context).toEqual({ kind: "error", message: "The key was not found." });
  });
});

describe("hasGlossaryHits", () => {
  it("is true when a term or a term to keep untranslated applies", () => {
    expect(hasGlossaryHits(NO_GLOSSARY)).toBe(false);
    expect(
      hasGlossaryHits({ terms: [], doNotTranslate: [{ term: "Verbatra", caseSensitive: true }] }),
    ).toBe(true);
    expect(
      hasGlossaryHits({
        terms: [{ source: "cart", forbidden: ["Karren"], caseSensitive: false }],
        doNotTranslate: [],
      }),
    ).toBe(true);
  });
});

describe("draft flags", () => {
  it("flags a used, a missing, and a forbidden rendering", () => {
    expect(
      draftTermFlags({ source: "cart", target: "Korb", targetUsed: true, forbiddenUsed: [] }),
    ).toEqual([{ tone: "success", label: "Used" }]);
    expect(
      draftTermFlags({
        source: "cart",
        target: "Korb",
        targetUsed: false,
        forbiddenUsed: ["Karren"],
      }),
    ).toEqual([
      { tone: "warning", label: "Missing" },
      { tone: "danger", label: "Forbidden: Karren" },
    ]);
    expect(draftTermFlags({ source: "cart", forbiddenUsed: [] })).toEqual([]);
    expect(draftTermFlags(undefined)).toEqual([]);
  });

  it("flags a term to keep untranslated as kept or missing", () => {
    expect(draftFixedTermFlags({ term: "Verbatra", kept: true })).toEqual([
      { tone: "success", label: "Kept" },
    ]);
    expect(draftFixedTermFlags({ term: "Verbatra", kept: false })).toEqual([
      { tone: "warning", label: "Missing" },
    ]);
    expect(draftFixedTermFlags(undefined)).toEqual([]);
  });

  it("reads the draft check only from a successful response", () => {
    const draftCheck = { terms: [], doNotTranslate: [] };
    expect(
      draftCheckFor({ ok: true, result: { source: "a", glossary: NO_GLOSSARY, draftCheck } }),
    ).toBe(draftCheck);
    expect(draftCheckFor({ ok: false, error: { code: "X", message: "y" } })).toBeUndefined();
  });
});
