import { describe, expect, it } from "vitest";
import type { LocaleGlossary } from "./glossary.js";
import { glossaryEntriesInText } from "./glossary-hits.js";

const GLOSSARY: LocaleGlossary = {
  terms: [
    { source: "cart", target: "Warenkorb", forbidden: ["Karren"], caseSensitive: false },
    { source: "Checkout", target: "Kasse", forbidden: [], caseSensitive: true },
    { source: "order", forbidden: ["Befehl"], caseSensitive: false },
  ],
  doNotTranslate: [
    { term: "Verbatra", caseSensitive: true },
    { term: "pro", caseSensitive: false },
  ],
};

describe("glossaryEntriesInText", () => {
  it("keeps the terms and fixed terms that occur as whole terms in the text", () => {
    expect(glossaryEntriesInText(GLOSSARY, "Your Cart at Verbatra", "en")).toEqual({
      terms: [GLOSSARY.terms[0]],
      doNotTranslate: [GLOSSARY.doNotTranslate[0]],
    });
  });

  it("ignores a term that only appears inside a longer word", () => {
    const hits = glossaryEntriesInText(GLOSSARY, "Carts are reordered by a programmer", "en");

    expect(hits).toEqual({ terms: [], doNotTranslate: [] });
  });

  it("honours case sensitivity per term", () => {
    expect(glossaryEntriesInText(GLOSSARY, "go to checkout", "en").terms).toEqual([]);
    expect(glossaryEntriesInText(GLOSSARY, "go to Checkout", "en").terms).toEqual([
      GLOSSARY.terms[1],
    ]);
    expect(glossaryEntriesInText(GLOSSARY, "verbatra PRO", "en").doNotTranslate).toEqual([
      GLOSSARY.doNotTranslate[1],
    ]);
  });

  it("finds a term with no required translation, for its forbidden renderings", () => {
    expect(glossaryEntriesInText(GLOSSARY, "Track your order", "en").terms).toEqual([
      GLOSSARY.terms[2],
    ]);
  });
});
