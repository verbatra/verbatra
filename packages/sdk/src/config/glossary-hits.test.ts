import { describe, expect, it } from "vitest";
import type { GlossaryDefinition } from "./glossary.js";
import { glossaryDraftCheck, glossaryHits } from "./glossary-hits.js";

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
    expect(
      glossaryHits({
        glossary: GLOSSARY,
        locale: "de",
        sourceLocale: "en",
        text: "Your cart at Verbatra",
      }),
    ).toEqual({
      terms: [{ source: "cart", target: "Warenkorb", forbidden: ["Karren"], caseSensitive: false }],
      doNotTranslate: [{ term: "Verbatra", caseSensitive: true }],
    });
  });

  it("resolves the translation for the requested locale", () => {
    expect(
      glossaryHits({ glossary: GLOSSARY, locale: "fr", sourceLocale: "en", text: "Cart" }).terms,
    ).toMatchObject([{ source: "cart", target: "panier", forbidden: [] }]);
  });

  it("matches whole terms only, with case where the term asks for it", () => {
    expect(
      glossaryHits({
        glossary: GLOSSARY,
        locale: "de",
        sourceLocale: "en",
        text: "carts and checkout",
      }),
    ).toEqual({
      terms: [],
      doNotTranslate: [],
    });
  });

  it("accepts a version 1 term map", () => {
    expect(
      glossaryHits({
        glossary: { cart: "Warenkorb" },
        locale: "de",
        sourceLocale: "en",
        text: "cart",
      }).terms,
    ).toMatchObject([{ source: "cart", target: "Warenkorb" }]);
  });

  it("finds nothing without a glossary", () => {
    expect(
      glossaryHits({ glossary: undefined, locale: "de", sourceLocale: "en", text: "cart" }),
    ).toEqual({ terms: [], doNotTranslate: [] });
  });
});

describe("glossaryDraftCheck", () => {
  it("checks a draft against the terms its source text carries", () => {
    expect(
      glossaryDraftCheck({
        glossary: GLOSSARY,
        locale: "de",
        sourceLocale: "en",
        source: "Your cart at Verbatra",
        draft: "Dein Karren bei verbatra",
      }),
    ).toEqual({
      terms: [
        { source: "cart", target: "Warenkorb", targetUsed: false, forbiddenUsed: ["Karren"] },
      ],
      doNotTranslate: [{ term: "Verbatra", kept: false }],
    });
  });

  it("finds nothing to check without a glossary", () => {
    expect(
      glossaryDraftCheck({
        glossary: undefined,
        locale: "de",
        sourceLocale: "en",
        source: "cart",
        draft: "Wagen",
      }),
    ).toEqual({ terms: [], doNotTranslate: [] });
  });
});
