import { describe, expect, it } from "vitest";
import {
  glossaryGetParamsSchema,
  glossaryWriteParamsSchema,
  MAX_FORBIDDEN_RENDERINGS,
  MAX_GLOSSARY_TERM_LENGTH,
  MAX_GLOSSARY_TRANSLATION_LENGTH,
} from "./glossary.js";

describe("glossaryGetParamsSchema", () => {
  it("accepts an empty object", () => {
    expect(glossaryGetParamsSchema.safeParse({}).success).toBe(true);
  });

  it("rejects an object with any key present", () => {
    expect(glossaryGetParamsSchema.safeParse({ extra: true }).success).toBe(false);
  });
});

describe("glossaryWriteParamsSchema", () => {
  it("accepts a term with a translation", () => {
    const parsed = glossaryWriteParamsSchema.safeParse({
      term: "Verbatra",
      translation: "Verbatra",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a null translation, which is how a term is removed", () => {
    expect(
      glossaryWriteParamsSchema.safeParse({ term: "Verbatra", translation: null }).success,
    ).toBe(true);
  });

  it("rejects an empty term and an empty translation", () => {
    expect(glossaryWriteParamsSchema.safeParse({ term: "", translation: "x" }).success).toBe(false);
    expect(glossaryWriteParamsSchema.safeParse({ term: "x", translation: "" }).success).toBe(false);
  });

  it("accepts the per-locale fields and a do-not-translate edit", () => {
    expect(
      glossaryWriteParamsSchema.safeParse({
        term: "Dashboard",
        locale: "de",
        translation: "Übersicht",
        forbidden: ["Instrumententafel"],
        note: "Start page",
        partOfSpeech: "noun",
        caseSensitive: true,
      }).success,
    ).toBe(true);
    expect(
      glossaryWriteParamsSchema.safeParse({ term: "verbatra", doNotTranslate: true }).success,
    ).toBe(true);
  });

  it("rejects an empty forbidden rendering and more renderings than the cap", () => {
    expect(
      glossaryWriteParamsSchema.safeParse({ term: "A", locale: "de", forbidden: [""] }).success,
    ).toBe(false);
    expect(
      glossaryWriteParamsSchema.safeParse({
        term: "A",
        locale: "de",
        forbidden: Array(MAX_FORBIDDEN_RENDERINGS + 1).fill("x"),
      }).success,
    ).toBe(false);
  });

  it("caps the term and the translation length", () => {
    expect(
      glossaryWriteParamsSchema.safeParse({
        term: "a".repeat(MAX_GLOSSARY_TERM_LENGTH + 1),
        translation: "x",
      }).success,
    ).toBe(false);
    expect(
      glossaryWriteParamsSchema.safeParse({
        term: "a",
        translation: "x".repeat(MAX_GLOSSARY_TRANSLATION_LENGTH + 1),
      }).success,
    ).toBe(false);
  });

  it("declares no field by which a client could name the file to write", () => {
    expect(Object.keys(glossaryWriteParamsSchema.shape)).toEqual([
      "term",
      "translation",
      "locale",
      "forbidden",
      "note",
      "partOfSpeech",
      "caseSensitive",
      "doNotTranslate",
    ]);
  });
});
