import { describe, expect, it } from "vitest";
import { parseLocaleSpelling } from "./locale-spelling.js";

describe("parseLocaleSpelling: accepted spellings", () => {
  it.each([
    ["de", { locale: "de", kind: "plain" }],
    ["pt-BR", { locale: "pt-BR", kind: "hyphen" }],
    ["pt_BR", { locale: "pt-BR", kind: "underscore" }],
    ["zh-Hant-TW", { locale: "zh-Hant-TW", kind: "hyphen" }],
    ["es_419", { locale: "es-419", kind: "underscore" }],
    ["pt-br", { locale: "pt-br", kind: "hyphen" }],
    ["zh-hant-tw", { locale: "zh-hant-tw", kind: "hyphen" }],
    ["values", { locale: undefined, kind: "android-source" }],
    ["values-de", { locale: "de", kind: "android" }],
    ["values-pt-rBR", { locale: "pt-BR", kind: "android" }],
    ["values-b+zh+Hant+TW", { locale: "zh-Hant-TW", kind: "android" }],
  ])("reads %s", (spelling, expected) => {
    expect(parseLocaleSpelling(spelling)).toEqual(expected);
  });
});

describe("parseLocaleSpelling: rejected spellings", () => {
  it.each([
    "",
    "components",
    "api",
    "DE",
    "pt_BR-x",
    "en-US-US",
    "en-Latn-US-extra",
    "values-night",
    "values-v21",
    "values-b+",
    "values-rBR",
    "toString",
  ])("rejects %j", (spelling) => {
    expect(parseLocaleSpelling(spelling)).toBeUndefined();
  });
});
