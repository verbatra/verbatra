import { describe, expect, it } from "vitest";
import { appliesTerms, localeGlossarySchema } from "./glossary.js";

describe("appliesTerms", () => {
  it.each([
    ["no glossary", undefined, false],
    ["an empty glossary", { terms: [], doNotTranslate: [] }, false],
    [
      "only forbidden renderings",
      { terms: [{ source: "A", forbidden: ["B"], caseSensitive: false }], doNotTranslate: [] },
      false,
    ],
    [
      "a required translation",
      {
        terms: [{ source: "A", target: "B", forbidden: [], caseSensitive: false }],
        doNotTranslate: [],
      },
      true,
    ],
    [
      "a do-not-translate term",
      { terms: [], doNotTranslate: [{ term: "A", caseSensitive: true }] },
      true,
    ],
  ])("reports whether %s asks a provider to apply anything", (_label, glossary, expected) => {
    expect(appliesTerms(glossary)).toBe(expected);
  });
});

describe("localeGlossarySchema", () => {
  it("rejects a flat term map, the shape a request carried before glossaries were per locale", () => {
    expect(localeGlossarySchema.safeParse({ Save: "Speichern" }).success).toBe(false);
  });
});
