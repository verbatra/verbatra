import type { TranslationEntry } from "@verbatra/core";
import {
  createArbAdapter,
  createDefaultRegistry,
  createNextIntlJsonAdapter,
  type FormatAdapter,
} from "@verbatra/format-adapters";
import { describe, expect, it } from "vitest";
import { gateCandidateValue } from "./integrity-gate.js";

function adapterFor(format: "i18next-json"): FormatAdapter {
  const resolution = createDefaultRegistry().resolve("", { format });
  if (resolution.status !== "resolved") {
    throw new Error(`${format} did not resolve`);
  }
  return resolution.adapter;
}

function pluralEntry(value: string): TranslationEntry {
  return { key: "files", namespace: "en", value, placeholders: ["{n}"], isPlural: true };
}

const EN = pluralEntry("{n, plural, one {# file} other {# files}}");
const RU_FULL = "{n, plural, one {# файл} few {# файла} many {# файлов} other {# файла}}";
const RU_ENGLISH_SHAPE = "{n, plural, one {# файл} other {# файла}}";

describe.each([
  ["next-intl-json", createNextIntlJsonAdapter()],
  ["arb", createArbAdapter()],
])("gateCandidateValue: %s plural arms follow the target language", (_format, adapter) => {
  it("accepts a Russian candidate with one, few, many and other", () => {
    expect(gateCandidateValue(EN, RU_FULL, adapter, "ru")).toMatchObject({ accepted: true });
  });

  it("refuses a Russian candidate missing few and many under icu, naming both arms", () => {
    expect(gateCandidateValue(EN, RU_ENGLISH_SHAPE, adapter, "ru")).toEqual({
      accepted: false,
      reason: "icu",
      details: [
        '{n} plural: missing arm "few" required by the target language',
        '{n} plural: missing arm "many" required by the target language',
      ],
    });
  });

  it("accepts a Japanese candidate with other only, keeping an exact-value arm", () => {
    const source = pluralEntry("{n, plural, =0 {no files} one {# file} other {# files}}");
    const candidate = "{n, plural, =0 {ファイルなし} other {# 個のファイル}}";

    expect(gateCandidateValue(source, candidate, adapter, "ja")).toMatchObject({ accepted: true });
  });

  it("refuses a Japanese candidate that keeps the English one arm", () => {
    expect(gateCandidateValue(EN, "{n, plural, one {# 個} other {# 個}}", adapter, "ja")).toEqual({
      accepted: false,
      reason: "icu",
      details: ['{n} plural: arm "one" is not a plural category of the target language'],
    });
  });

  it("resolves a region-tagged or underscored locale to its language's rules", () => {
    expect(gateCandidateValue(EN, RU_FULL, adapter, "ru_RU")).toMatchObject({ accepted: true });
    expect(gateCandidateValue(EN, RU_ENGLISH_SHAPE, adapter, "ru-RU").accepted).toBe(false);
  });

  it("requires only other for a locale the runtime has no plural rules for", () => {
    expect(gateCandidateValue(EN, RU_ENGLISH_SHAPE, adapter, "x-klingon")).toMatchObject({
      accepted: true,
    });
  });

  it("skips the arm rule when no target locale is given, as pseudolocalization does", () => {
    expect(gateCandidateValue(EN, RU_ENGLISH_SHAPE, adapter, undefined)).toMatchObject({
      accepted: true,
    });
  });

  it("still judges placeholders first, so an invented argument stays a placeholder refusal", () => {
    const candidate = "{n, plural, one {# {x}} few {#} many {#} other {#}}";

    expect(gateCandidateValue(EN, candidate, adapter, "ru")).toEqual({
      accepted: false,
      reason: "placeholder",
      details: ["+{x}"],
    });
  });
});

describe("gateCandidateValue: formats without a branch-arm check", () => {
  it("leaves an i18next value to its own plural keys", () => {
    const source: TranslationEntry = {
      key: "files_one",
      namespace: "en",
      value: "{{count}} file",
      placeholders: ["{{count}}"],
      isPlural: true,
    };

    expect(
      gateCandidateValue(source, "{{count}} файл", adapterFor("i18next-json"), "ru"),
    ).toMatchObject({ accepted: true });
  });
});
