import { describe, expect, it } from "vitest";
import type { LocaleGlossary } from "./glossary.js";
import { checkGlossaryDraft } from "./glossary-term-checks.js";

const hits: LocaleGlossary = {
  terms: [
    { source: "cart", target: "Warenkorb", forbidden: ["Einkaufswagen"], caseSensitive: false },
    { source: "checkout", forbidden: ["Checkout"], caseSensitive: true },
  ],
  doNotTranslate: [{ term: "Verbatra", caseSensitive: true }],
};

describe("checkGlossaryDraft", () => {
  it("reports a required term the draft uses, with case folded as the term says", () => {
    const check = checkGlossaryDraft({
      hits,
      sourceValue: "Open the cart with Verbatra",
      draft: "Öffne den warenkorb mit Verbatra",
      targetLocale: "de",
    });

    expect(check.terms[0]).toEqual({
      source: "cart",
      target: "Warenkorb",
      targetUsed: true,
      forbiddenUsed: [],
    });
    expect(check.doNotTranslate).toEqual([{ term: "Verbatra", kept: true }]);
  });

  it("reports a missing required term, a forbidden rendering, and a dropped fixed term", () => {
    const check = checkGlossaryDraft({
      hits,
      sourceValue: "Open the cart and checkout",
      draft: "Öffne den Einkaufswagen und Checkout mit verbatra",
      targetLocale: "de",
    });

    expect(check.terms).toEqual([
      {
        source: "cart",
        target: "Warenkorb",
        targetUsed: false,
        forbiddenUsed: ["Einkaufswagen"],
      },
      { source: "checkout", forbiddenUsed: ["Checkout"] },
    ]);
    expect(check.doNotTranslate).toEqual([{ term: "Verbatra", kept: false }]);
  });

  it("does not count a forbidden rendering the source itself carries", () => {
    const check = checkGlossaryDraft({
      hits,
      sourceValue: "Checkout",
      draft: "Checkout",
      targetLocale: "de",
    });

    expect(check.terms[1]?.forbiddenUsed).toEqual([]);
  });

  it("treats an empty required translation as no requirement", () => {
    const check = checkGlossaryDraft({
      hits: {
        terms: [{ source: "cart", target: "", forbidden: [], caseSensitive: false }],
        doNotTranslate: [],
      },
      sourceValue: "cart",
      draft: "x",
      targetLocale: "de",
    });

    expect(check.terms).toEqual([{ source: "cart", forbiddenUsed: [] }]);
  });
});
