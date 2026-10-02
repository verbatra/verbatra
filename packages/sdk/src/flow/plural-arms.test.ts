import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { PluralCategories } from "@verbatra/ai-providers";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import {
  baseConfig,
  makeStubProvider,
  makeTempDir,
  readJsonFile,
  writeJsonFile,
} from "../test-support.js";
import { editEntry } from "./edit-entry.js";
import { translate } from "./translate-project.js";

const SOURCE = {
  files: "{n, plural, one {# file} other {# files}}",
  place: "{n, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}",
  greeting: "Hello {name}",
};

const cfg = (overrides: Partial<VerbatraConfig> = {}): VerbatraConfig =>
  baseConfig({ targetLocales: ["ru", "ja"], format: "next-intl-json", ...overrides });

async function project(targets: Record<string, Record<string, string>> = {}): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), SOURCE);
  for (const [locale, values] of Object.entries(targets)) {
    await writeJsonFile(join(dir, "locales", `${locale}.json`), values);
  }
  return dir;
}

function armsFrom(categories: readonly string[], text: string): string {
  return categories.map((category) => `${category} {# ${text}}`).join(" ");
}

function pluralAwareTranslation(
  categoriesFor: (locale: string) => PluralCategories | undefined,
): (value: string, key: string, locale: string) => string {
  return (value, key, locale) => {
    const categories = categoriesFor(locale);
    if (categories === undefined || key === "greeting") {
      return `[${locale}] ${value}`;
    }
    return key === "files"
      ? `{n, plural, ${armsFrom(categories.cardinal, locale)}}`
      : `{n, selectordinal, ${armsFrom(categories.ordinal, locale)}}`;
  };
}

async function localeFile(dir: string, locale: string): Promise<Record<string, string>> {
  return (await readJsonFile(join(dir, "locales", `${locale}.json`))) as Record<string, string>;
}

describe("translate: ICU plural arms per target language", () => {
  it("sends each target language's CLDR categories to the provider as request data", async () => {
    const dir = await project();
    const stub = makeStubProvider();

    await translate({ config: cfg(), cwd: dir }, { createProvider: () => stub.provider });

    const byLocale = new Map(stub.calls.map((call) => [call.request.targetLocale, call.request]));
    expect(byLocale.get("ru")?.pluralCategories).toEqual({
      cardinal: ["one", "few", "many", "other"],
      ordinal: ["other"],
    });
    expect(byLocale.get("ja")?.pluralCategories).toEqual({
      cardinal: ["other"],
      ordinal: ["other"],
    });
  });

  it("writes a translation whose arms match the target language: one, few, many, other for Russian and other alone for Japanese", async () => {
    const dir = await project();
    const received = new Map<string, PluralCategories | undefined>();
    const stub = makeStubProvider({
      translate: pluralAwareTranslation((locale) => received.get(locale)),
    });
    const provider = {
      ...stub.provider,
      translateBatch: (request: Parameters<typeof stub.provider.translateBatch>[0]) => {
        received.set(request.targetLocale, request.pluralCategories);
        return stub.provider.translateBatch(request);
      },
    };

    const summary = await translate(
      { config: cfg(), cwd: dir },
      { createProvider: () => provider },
    );

    expect(summary.locales.flatMap((locale) => locale.integrityMismatches)).toEqual([]);
    expect((await localeFile(dir, "ru")).files).toBe(
      "{n, plural, one {# ru} few {# ru} many {# ru} other {# ru}}",
    );
    expect((await localeFile(dir, "ja")).files).toBe("{n, plural, other {# ja}}");
    expect((await localeFile(dir, "ja")).place).toBe("{n, selectordinal, other {# ja}}");
  });

  it("withholds a translation that keeps the English arms for Russian but writes it for German", async () => {
    const dir = await project();
    const stub = makeStubProvider({ translate: (value) => value });

    const summary = await translate(
      { config: cfg({ targetLocales: ["ru", "de"] }), cwd: dir },
      { createProvider: () => stub.provider },
    );

    const mismatches = (locale: string): readonly string[] =>
      summary.locales.find((entry) => entry.locale === locale)?.integrityMismatches ?? [];
    expect([...mismatches("ru")].sort()).toEqual(["files", "place"]);
    expect([...mismatches("de")].sort()).toEqual(["place"]);
    expect((await localeFile(dir, "de")).files).toBe(SOURCE.files);
    expect((await localeFile(dir, "ru")).files).toBeUndefined();
  });

  it("sends no plural categories for a batch without a plural value", async () => {
    const dir = await project({
      ru: {
        files: "{n, plural, one {#} few {#} many {#} other {#}}",
        place: "{n, selectordinal, other {#}}",
      },
    });
    const stub = makeStubProvider();

    await translate(
      { config: cfg({ targetLocales: ["ru"] }), cwd: dir },
      { createProvider: () => stub.provider },
    );

    expect(stub.calls.map((call) => call.request.entries.map((entry) => entry.key))).toEqual([
      ["greeting"],
    ]);
    expect(stub.calls[0]?.request.pluralCategories).toBeUndefined();
  });

  it("sends no plural categories for a locale the runtime has no plural rules for", async () => {
    const dir = await project();
    const stub = makeStubProvider({ translate: (value) => value });

    await translate(
      { config: cfg({ targetLocales: ["x-klingon"] }), cwd: dir },
      { createProvider: () => stub.provider },
    );

    expect(stub.calls[0]?.request.pluralCategories).toBeUndefined();
  });

  it("sends no plural categories for a format without a branch-arm check", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, "locales"));
    await writeJsonFile(join(dir, "locales", "en.json"), {
      files_one: "{{count}} file",
      files_other: "{{count}} files",
    });
    const stub = makeStubProvider();

    await translate(
      { config: cfg({ format: "i18next-json", targetLocales: ["ru"] }), cwd: dir },
      { createProvider: () => stub.provider },
    );

    expect(stub.calls[0]?.request.pluralCategories).toBeUndefined();
  });
});

describe("editEntry: ICU plural arms per target language", () => {
  it("refuses a hand-typed Russian value with only one and other, naming the missing arms", async () => {
    const dir = await project({ ru: {} });

    const result = await editEntry({
      config: cfg(),
      cwd: dir,
      locale: "ru",
      key: "files",
      value: "{n, plural, one {# файл} other {# файла}}",
    });

    expect(result).toMatchObject({
      accepted: false,
      reason: "icu",
      details: [
        '{n} plural: missing arm "few" required by the target language',
        '{n} plural: missing arm "many" required by the target language',
      ],
    });
  });

  it("accepts a hand-typed Russian value with every Russian arm", async () => {
    const dir = await project({ ru: {} });

    const result = await editEntry({
      config: cfg(),
      cwd: dir,
      locale: "ru",
      key: "files",
      value: "{n, plural, one {# файл} few {# файла} many {# файлов} other {# файла}}",
    });

    expect(result.accepted).toBe(true);
  });
});
