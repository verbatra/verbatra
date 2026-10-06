import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pseudolocalizeBidiValue, type SupportedFormat } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import { createLocalePathResolver } from "../locale-path/resolver.js";
import { selectAdapter } from "../selection/select-adapter.js";
import { baseConfig, makeTempDir, readJsonFile, writeJsonFile } from "../test-support.js";
import { pseudolocalize } from "./pseudo.js";

const cfg = (overrides: Partial<VerbatraConfig> = {}): VerbatraConfig =>
  baseConfig({ targetLocales: ["de"], format: "i18next-json", ...overrides });

async function i18nextProject(source: Record<string, unknown>): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), source);
  return dir;
}

const ITEMS = { items_one: "{{count}} item", items_other: "{{count}} items" };

describe("pseudolocalize in bidi mode: i18next suffix plurals cover the pseudolocale's language", () => {
  it("fills every Arabic category the source lacks from its other form", async () => {
    const dir = await i18nextProject(ITEMS);

    const result = await pseudolocalize({ config: cfg(), cwd: dir, mode: "bidi" });
    const written = (await readJsonFile(result.path)) as Record<string, string>;

    expect(Object.keys(written).sort()).toEqual(
      ["items_few", "items_many", "items_one", "items_other", "items_two", "items_zero"].sort(),
    );
    expect(written.items_one).toBe(pseudolocalizeBidiValue(ITEMS.items_one));
    for (const category of ["zero", "two", "few", "many", "other"]) {
      expect(written[`items_${category}`]).toBe(pseudolocalizeBidiValue(ITEMS.items_other));
    }
    expect(result).toMatchObject({ entries: 6, transformed: 6, copied: [] });
  });

  it("fills ordinal categories by the language's ordinal rules", async () => {
    const dir = await i18nextProject({
      place_ordinal_one: "{{count}}st place",
      place_ordinal_two: "{{count}}nd place",
      place_ordinal_few: "{{count}}rd place",
      place_ordinal_other: "{{count}}th place",
    });

    const result = await pseudolocalize({
      config: cfg(),
      cwd: dir,
      mode: "bidi",
      locale: "cy-XB",
    });
    const written = (await readJsonFile(result.path)) as Record<string, string>;

    expect(written.place_ordinal_zero).toBe(pseudolocalizeBidiValue("{{count}}th place"));
    expect(written.place_ordinal_many).toBe(pseudolocalizeBidiValue("{{count}}th place"));
  });

  it("rewrites nothing on a second run over the unchanged source", async () => {
    const dir = await i18nextProject(ITEMS);
    const first = await pseudolocalize({ config: cfg(), cwd: dir, mode: "bidi" });
    const afterFirst = await readFile(first.path, "utf8");

    const second = await pseudolocalize({ config: cfg(), cwd: dir, mode: "bidi" });

    expect(second.written).toBe(false);
    expect(await readFile(second.path, "utf8")).toBe(afterFirst);
  });

  it("adds no plural form in accented mode, even for a locale with more categories", async () => {
    const dir = await i18nextProject(ITEMS);

    const result = await pseudolocalize({ config: cfg(), cwd: dir, locale: "ar-XA" });

    expect(Object.keys((await readJsonFile(result.path)) as object).sort()).toEqual([
      "items_one",
      "items_other",
    ]);
  });

  it("adds no plural form for a locale whose categories the source already covers", async () => {
    const dir = await i18nextProject(ITEMS);

    const result = await pseudolocalize({ config: cfg(), cwd: dir, mode: "bidi", locale: "en-XB" });

    expect(Object.keys((await readJsonFile(result.path)) as object).sort()).toEqual([
      "items_one",
      "items_other",
    ]);
  });
});

describe("pseudolocalize in bidi mode: transformed counts only values that changed", () => {
  it("does not count a bare placeholder, a symbol and digits, or an empty value", async () => {
    const dir = await i18nextProject({
      name: "{name}",
      printf: "%s",
      year: "© 2024",
      blank: "",
      greeting: "Hello",
    });

    const result = await pseudolocalize({ config: cfg(), cwd: dir, mode: "bidi" });

    expect(result).toMatchObject({ entries: 5, transformed: 1, copied: [] });
  });

  it("counts a value the accented mode changes, so the default stays as it was", async () => {
    const dir = await i18nextProject({ name: "{{name}}", greeting: "Hello", blank: "" });

    const result = await pseudolocalize({ config: cfg(), cwd: dir });

    expect(result).toMatchObject({ entries: 3, transformed: 2, copied: [] });
  });
});

interface PluralFixture {
  readonly format: SupportedFormat;
  readonly pattern: string;
  readonly localeStyle?: "android";
  readonly content: string;
}

const XCSTRINGS_PLURAL = `${JSON.stringify(
  {
    sourceLanguage: "en",
    version: "1.0",
    strings: {
      photos: {
        localizations: {
          en: {
            variations: {
              plural: {
                one: { stringUnit: { state: "translated", value: "%lld photo" } },
                other: { stringUnit: { state: "translated", value: "%lld photos" } },
              },
            },
          },
        },
      },
    },
  },
  null,
  2,
)}\n`;

const NATIVE_PLURALS: readonly PluralFixture[] = [
  {
    format: "android-xml",
    pattern: "res/{locale}/strings.xml",
    localeStyle: "android",
    content:
      '<?xml version="1.0" encoding="utf-8"?>\n<resources><plurals name="photos"><item quantity="one">%d photo</item><item quantity="other">%d photos</item></plurals></resources>\n',
  },
  {
    format: "gettext-po",
    pattern: "locales/{locale}.po",
    content:
      'msgid ""\nmsgstr ""\n"Content-Type: text/plain; charset=UTF-8\\n"\n"Plural-Forms: nplurals=2; plural=(n != 1);\\n"\n\nmsgid "%d photo"\nmsgid_plural "%d photos"\nmsgstr[0] "%d photo"\nmsgstr[1] "%d photos"\n',
  },
  {
    format: "apple-xcstrings",
    pattern: "Localizable{locale}.xcstrings",
    content: XCSTRINGS_PLURAL,
  },
  {
    format: "next-intl-json",
    pattern: "locales/{locale}.json",
    content: `${JSON.stringify({ photos: "{count, plural, one {# photo} other {# photos}}" })}\n`,
  },
  {
    format: "vue-i18n-json",
    pattern: "locales/{locale}.json",
    content: `${JSON.stringify({ photos: "photo | photos" })}\n`,
  },
];

function pluralConfig(fixture: PluralFixture): VerbatraConfig {
  return baseConfig({
    format: fixture.format,
    targetLocales: ["de"],
    files: {
      pattern: fixture.pattern,
      ...(fixture.localeStyle !== undefined ? { localeStyle: fixture.localeStyle } : {}),
    },
  });
}

describe("pseudolocalize in bidi mode: plurals the format resolves itself are left as the source has them", () => {
  it.each(NATIVE_PLURALS.map((fixture) => [fixture.format, fixture] as const))(
    "%s keeps the source's plural forms, each overridden",
    async (_format, fixture) => {
      const config = pluralConfig(fixture);
      const dir = await makeTempDir();
      const sourcePath = createLocalePathResolver(dir, config).pathFor(config.sourceLocale);
      await mkdir(dirname(sourcePath), { recursive: true });
      await writeFile(sourcePath, fixture.content, "utf8");
      const adapter = selectAdapter(fixture.format);
      const source = (await adapter.read(sourcePath, config.sourceLocale)).resource.entries;

      const result = await pseudolocalize({ config, cwd: dir, mode: "bidi" });
      const written = (await adapter.read(result.path, result.locale)).resource.entries;

      expect([...written.keys()].sort()).toEqual([...source.keys()].sort());
      expect(result.copied).toEqual([]);
      for (const [key, entry] of written) {
        expect(entry.value).toContain("‮");
        expect(entry.value).not.toBe(source.get(key)?.value);
      }
    },
  );
});
