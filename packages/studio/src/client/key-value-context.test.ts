import { describe, expect, it } from "vitest";
import { deriveKeyValueContext, hasGlossaryHits } from "./key-value-context.js";

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
