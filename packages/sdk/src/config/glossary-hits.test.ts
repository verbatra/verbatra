import { describe, expect, it } from "vitest";
import type { GlossaryDefinition } from "./glossary.js";
import { glossaryHits } from "./glossary-hits.js";

const GLOSSARY: GlossaryDefinition = {
  version: 2,
  terms: [
    {
      source: "cart",
      target: "Warenkorb",
      targets: { fr: "panier" },
      forbidden: { de: ["Karren"] },
    },
    { source: "Checkout", target: "Kasse", caseSensitive: true },
  ],
  doNotTranslate: ["Verbatra"],
};

describe("glossaryHits", () => {
  it("returns the terms in the text with what the target locale is held to", () => {
    expect(glossaryHits(GLOSSARY, "de", "en", "Your cart at Verbatra")).toEqual({
      terms: [{ source: "cart", target: "Warenkorb", forbidden: ["Karren"], caseSensitive: false }],
      doNotTranslate: [{ term: "Verbatra", caseSensitive: true }],
    });
  });

  it("resolves the translation for the requested locale", () => {
    expect(glossaryHits(GLOSSARY, "fr", "en", "Cart").terms).toMatchObject([
      { source: "cart", target: "panier", forbidden: [] },
    ]);
  });

  it("matches whole terms only, with case where the term asks for it", () => {
    expect(glossaryHits(GLOSSARY, "de", "en", "carts and checkout")).toEqual({
      terms: [],
      doNotTranslate: [],
    });
  });

  it("accepts a version 1 term map", () => {
    expect(glossaryHits({ cart: "Warenkorb" }, "de", "en", "cart").terms).toMatchObject([
      { source: "cart", target: "Warenkorb" },
    ]);
  });

  it("finds nothing without a glossary", () => {
    expect(glossaryHits(undefined, "de", "en", "cart")).toEqual({ terms: [], doNotTranslate: [] });
  });
});
