import { buildDataPayload, type LocaleGlossary } from "@verbatra/ai-providers";
import { describe, expect, it } from "vitest";
import { PROVIDER_IDS } from "./provider-config.js";
import { type DataFlowField, dataFlowOf, PROVIDER_DATA_FLOW } from "./provider-data-flow.js";
import { kindOf } from "./provider-kind.js";

const PAYLOAD_FIELD: Readonly<Record<string, DataFlowField>> = {
  sourceLocale: "language-codes",
  targetLocale: "language-codes",
  sourceLanguage: "language-names",
  targetLanguage: "language-names",
  tone: "tone",
  glossary: "glossary-terms",
  forbiddenTranslations: "glossary-terms",
  glossaryNotes: "glossary-terms",
  doNotTranslate: "glossary-terms",
  pluralCategories: "plural-categories",
  key: "key-name",
  value: "source-text",
  description: "description",
  meaning: "meaning",
};

const FULL_GLOSSARY: LocaleGlossary = {
  terms: [
    {
      source: "Cart",
      target: "Warenkorb",
      forbidden: ["Karren"],
      caseSensitive: false,
      note: "shopping",
      partOfSpeech: "noun",
    },
  ],
  doNotTranslate: [{ term: "verbatra", caseSensitive: true }],
};

function fullPayload(): Record<string, unknown> {
  return buildDataPayload({
    sourceLocale: "en",
    targetLocale: "de",
    tone: "formal",
    glossary: FULL_GLOSSARY,
    pluralCategories: { cardinal: ["one", "other"], ordinal: ["other"] },
    entries: [
      {
        key: "cart.title",
        namespace: "",
        value: "Cart",
        placeholders: [],
        isPlural: false,
        description: "heading",
        meaning: "noun",
      },
    ],
  });
}

function payloadKeys(payload: Record<string, unknown>): string[] {
  const { items, ...rest } = payload;
  const itemKeys = (items as Record<string, unknown>[]).flatMap((item) => Object.keys(item));
  return [...Object.keys(rest), ...itemKeys];
}

describe("PROVIDER_DATA_FLOW", () => {
  it("declares what every machine provider sends", () => {
    expect(Object.keys(PROVIDER_DATA_FLOW).sort()).toEqual([...PROVIDER_IDS].sort());
  });

  it("lists every field the LLM payload carries for each LLM provider", () => {
    const keys = payloadKeys(fullPayload());
    expect(keys.filter((key) => PAYLOAD_FIELD[key] === undefined)).toEqual([]);
    const carried = [...new Set(keys.map((key) => PAYLOAD_FIELD[key]))];
    for (const id of PROVIDER_IDS.filter((provider) => kindOf(provider) === "llm")) {
      expect(dataFlowOf(id).fields).toEqual(expect.arrayContaining(carried));
    }
  });

  it("marks every machine-translation provider as sending masked placeholders and no key name", () => {
    for (const id of PROVIDER_IDS.filter(
      (provider) => kindOf(provider) === "machine-translation",
    )) {
      expect(dataFlowOf(id).fields).toContain("placeholder-markers");
      expect(dataFlowOf(id).fields).not.toContain("key-name");
      expect(dataFlowOf(id).languageList).not.toBe("none");
    }
  });
});
