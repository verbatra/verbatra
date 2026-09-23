import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { LocaleResource, SupportedFormat, TranslationEntry } from "@verbatra/core";
import { SUPPORTED_FORMATS } from "@verbatra/core";
import { createDefaultRegistry, type FormatAdapter } from "@verbatra/format-adapters";
import { describe, expect, it } from "vitest";
import { editEntry } from "../flow/edit-entry.js";
import { keyValue } from "../flow/key-value.js";
import { baseConfig, makeTempDir } from "../test-support.js";

interface Fixture {
  readonly pattern: string;
  readonly sourceLocalePath?: string;
  readonly keys: Readonly<Record<string, string>>;
  readonly literal?: string;
}

const XLIFF_SOURCE = `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2"><file source-language="en" target-language="de" datatype="plaintext"><body>
<trans-unit id="title"><source>Title</source></trans-unit>
<trans-unit id="greeting"><source>Hello {name}</source></trans-unit>
</body></file></xliff>
`;

const XCSTRINGS_SOURCE = `${JSON.stringify(
  {
    sourceLanguage: "en",
    version: "1.0",
    strings: {
      title: { localizations: { en: { stringUnit: { state: "translated", value: "Title" } } } },
      greeting: {
        localizations: { en: { stringUnit: { state: "translated", value: "Hello %@" } } },
      },
    },
  },
  null,
  2,
)}\n`;

const FIXTURES: Record<SupportedFormat, Fixture> = {
  "i18next-json": {
    pattern: "locales/{locale}.json",
    keys: { title: "Title", greeting: "Hello {{name}}" },
  },
  "vue-i18n-json": {
    pattern: "locales/{locale}.json",
    keys: { title: "Title", greeting: "Hello {name}" },
  },
  "next-intl-json": {
    pattern: "messages/{locale}.json",
    keys: { title: "Title", greeting: "Hello {name}" },
  },
  "ngx-translate-json": {
    pattern: "locales/{locale}.json",
    keys: { title: "Title", greeting: "Hello {{name}}" },
  },
  xliff: { pattern: "locales/{locale}.xlf", keys: {}, literal: XLIFF_SOURCE },
  yaml: { pattern: "locales/{locale}.yaml", keys: { title: "Title", greeting: "Hello {{name}}" } },
  arb: { pattern: "locales/app_{locale}.arb", keys: { title: "Title", greeting: "Hello {name}" } },
  properties: {
    pattern: "locales/messages_{locale}.properties",
    keys: { title: "Title", greeting: "Hello {0}" },
  },
  "apple-strings": {
    pattern: "locales/{locale}.lproj/Localizable.strings",
    keys: { title: "Title", greeting: "Hello %@" },
  },
  "apple-xcstrings": {
    pattern: "locales/Localizable{locale}.xcstrings",
    sourceLocalePath: "locales/Localizable.xcstrings",
    keys: {},
    literal: XCSTRINGS_SOURCE,
  },
  "android-xml": {
    pattern: "res/values-{locale}/strings.xml",
    keys: { title: "Title", greeting: "Hello %1$s" },
  },
  "gettext-po": {
    pattern: "locales/{locale}.po",
    keys: { title: "Title", greeting: "Hello %(name)s" },
  },
  ini: {
    pattern: "locales/{locale}.ini",
    keys: { "section.title": "Title", "section.greeting": "Hello {name}" },
  },
  resx: {
    pattern: "locales/Messages.{locale}.resx",
    keys: { title: "Title", greeting: "Hello {0}" },
  },
};

const CORPUS: readonly string[] = [
  "Grüße aus Köln, 東京, and emoji 🎉",
  "Quotes \"double\" and 'single'",
  "Ampersand & angle < > signs",
  "Back\\slash and percent 50%",
  "Line one\nLine two",
  "Tab\tseparated",
  "Trailing space ",
  " Leading space",
];

function adapterFor(format: SupportedFormat): FormatAdapter {
  const resolution = createDefaultRegistry().resolve(`catalog.${format}`, { format });
  if (resolution.status !== "resolved") {
    throw new Error(`no adapter registered for ${format}`);
  }
  return resolution.adapter;
}

function sourcePath(fixture: Fixture): string {
  return fixture.sourceLocalePath ?? fixture.pattern.replace("{locale}", "en");
}

async function seedSource(dir: string, format: SupportedFormat): Promise<void> {
  const fixture = FIXTURES[format];
  const path = join(dir, sourcePath(fixture));
  await mkdir(dirname(path), { recursive: true });
  if (fixture.literal !== undefined) {
    await writeFile(path, fixture.literal, "utf8");
    if (format === "xliff") {
      await writeFile(
        join(dir, fixture.pattern.replace("{locale}", "de")),
        fixture.literal,
        "utf8",
      );
    }
    return;
  }
  const adapter = adapterFor(format);
  const entries = new Map<string, TranslationEntry>();
  for (const [key, value] of Object.entries(fixture.keys)) {
    entries.set(key, {
      key,
      namespace: "",
      value,
      placeholders: adapter.extractPlaceholders(value),
      isPlural: false,
    });
  }
  const resource: LocaleResource = { locale: "en", namespace: "", format, entries };
  await adapter.write(resource, path);
}

function plainKey(format: SupportedFormat): string {
  return format === "ini" ? "section.title" : "title";
}

describe("provenance: a value written through every built-in adapter reads back as recorded", () => {
  it.each(SUPPORTED_FORMATS)(
    "%s never reports a value it wrote itself as external",
    async (format) => {
      const dir = await makeTempDir();
      await seedSource(dir, format);
      const config = baseConfig({ format, files: { pattern: FIXTURES[format].pattern } });
      const key = plainKey(format);
      const outcomes: [string, string | undefined][] = [];

      for (const value of CORPUS) {
        const written = await editEntry({ config, cwd: dir, locale: "de", key, value });
        if (!written.accepted) {
          continue;
        }
        const read = await keyValue({ config, cwd: dir, locale: "de", key });
        outcomes.push([value, read.provenance?.origin]);
      }

      expect(outcomes.length).toBeGreaterThan(0);
      expect(outcomes.filter(([, origin]) => origin !== "human")).toEqual([]);
    },
  );
});
