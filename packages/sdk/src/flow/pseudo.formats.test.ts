import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { SUPPORTED_FORMATS, type SupportedFormat } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import { createLocalePathResolver } from "../locale-path/resolver.js";
import { selectAdapter } from "../selection/select-adapter.js";
import { baseConfig, makeTempDir } from "../test-support.js";
import { pseudolocalize } from "./pseudo.js";

interface FormatFixture {
  readonly pattern: string;
  readonly localeStyle?: "android";
  readonly content: string;
  readonly key: string;
  readonly token: string;
  readonly pluralKey?: string;
}

const XLIFF = `<?xml version="1.0" encoding="utf-8"?>
<xliff version="1.2"><file source-language="en" target-language="en" datatype="plaintext" original="app">
<body><trans-unit id="greeting"><source>Hello {name} and welcome</source><target>Hello {name} and welcome</target></trans-unit></body>
</file></xliff>
`;

const XCSTRINGS = `${JSON.stringify(
  {
    sourceLanguage: "en",
    version: "1.0",
    strings: {
      greeting: {
        localizations: {
          en: { stringUnit: { state: "translated", value: "Hello %@ and welcome" } },
        },
      },
    },
  },
  null,
  2,
)}\n`;

const RESX = `<?xml version="1.0" encoding="utf-8"?>
<root>
  <resheader name="resmimetype">
    <value>text/microsoft-resx</value>
  </resheader>
  <resheader name="version">
    <value>2.0</value>
  </resheader>
  <data name="greeting" xml:space="preserve">
    <value>Hello {0} and welcome</value>
  </data>
</root>
`;

const FIXTURES: Readonly<Record<SupportedFormat, FormatFixture>> = {
  "i18next-json": {
    pattern: "locales/{locale}.json",
    content: `${JSON.stringify({ greeting: "Hello {{name}} and welcome" }, null, 2)}\n`,
    key: "greeting",
    token: "{{name}}",
  },
  "ngx-translate-json": {
    pattern: "locales/{locale}.json",
    content: `${JSON.stringify({ greeting: "Hello {{name}} and welcome" }, null, 2)}\n`,
    key: "greeting",
    token: "{{name}}",
  },
  "vue-i18n-json": {
    pattern: "locales/{locale}.json",
    content: `${JSON.stringify({ greeting: "Hello {name} and welcome", car: "car | cars" }, null, 2)}\n`,
    key: "greeting",
    token: "{name}",
    pluralKey: "car",
  },
  "next-intl-json": {
    pattern: "locales/{locale}.json",
    content: `${JSON.stringify(
      {
        greeting: "Hello {name} and welcome",
        items: "{count, plural, one {# item left} other {# items left}}",
      },
      null,
      2,
    )}\n`,
    key: "greeting",
    token: "{name}",
  },
  yaml: {
    pattern: "locales/{locale}.yaml",
    content: 'greeting: "Hello {{name}} and welcome"\n',
    key: "greeting",
    token: "{{name}}",
  },
  arb: {
    pattern: "locales/{locale}.arb",
    content: `${JSON.stringify({ greeting: "Hello {name} and welcome" }, null, 2)}\n`,
    key: "greeting",
    token: "{name}",
  },
  properties: {
    pattern: "locales/{locale}.properties",
    content: "greeting=Hello {0} and welcome\n",
    key: "greeting",
    token: "{0}",
  },
  "apple-strings": {
    pattern: "locales/{locale}.strings",
    content: '"greeting" = "Hello %@ and welcome";\n',
    key: "greeting",
    token: "%@",
  },
  "apple-xcstrings": {
    pattern: "Localizable{locale}.xcstrings",
    content: XCSTRINGS,
    key: "greeting",
    token: "%@",
  },
  "android-xml": {
    pattern: "res/{locale}/strings.xml",
    localeStyle: "android",
    content:
      '<?xml version="1.0" encoding="utf-8"?>\n<resources><string name="greeting">Hello %1$s and welcome</string></resources>\n',
    key: "greeting",
    token: "%1$s",
  },
  xliff: {
    pattern: "locales/{locale}.xlf",
    content: XLIFF,
    key: "greeting",
    token: "{name}",
  },
  "gettext-po": {
    pattern: "locales/{locale}.po",
    content:
      'msgid ""\nmsgstr "Content-Type: text/plain; charset=UTF-8\\n"\n\nmsgid "greeting"\nmsgstr "Hello %s and welcome"\n',
    key: "greeting",
    token: "%s",
  },
  ini: {
    pattern: "locales/{locale}.ini",
    content: "greeting = Hello {name} and welcome\n",
    key: "greeting",
    token: "{name}",
  },
  resx: {
    pattern: "locales/{locale}.resx",
    content: RESX,
    key: "greeting",
    token: "{0}",
  },
};

function configFor(fixture: FormatFixture, format: SupportedFormat): VerbatraConfig {
  return baseConfig({
    format,
    targetLocales: ["de"],
    files: {
      pattern: fixture.pattern,
      ...(fixture.localeStyle !== undefined ? { localeStyle: fixture.localeStyle } : {}),
    },
  });
}

async function seedSource(fixture: FormatFixture, config: VerbatraConfig): Promise<string> {
  const dir = await makeTempDir();
  const path = createLocalePathResolver(dir, config).pathFor(config.sourceLocale);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, fixture.content, "utf8");
  return dir;
}

describe("pseudolocalize writes a readable pseudolocale for every supported format", () => {
  it.each(Object.keys(FIXTURES) as SupportedFormat[])("%s", async (format) => {
    const fixture = FIXTURES[format];
    const config = configFor(fixture, format);
    const dir = await seedSource(fixture, config);

    const result = await pseudolocalize({ config, cwd: dir });
    const adapter = selectAdapter(format);
    const written = await adapter.read(result.path, result.locale);
    const value = written.resource.entries.get(fixture.key)?.value ?? "";

    expect(result.written).toBe(true);
    expect(value).toContain(fixture.token);
    expect(value).toContain("ẃéĺćóṁé");
    if (fixture.pluralKey !== undefined) {
      const forms = (written.resource.entries.get(fixture.pluralKey)?.value ?? "").split("|");
      expect(forms).toHaveLength(2);
      for (const form of forms) {
        expect(form.trim().startsWith("[")).toBe(true);
        expect(form.trim().endsWith("]")).toBe(true);
      }
    }
  });

  it("covers every supported format, so the table cannot silently fall behind", () => {
    expect(Object.keys(FIXTURES).sort()).toEqual([...SUPPORTED_FORMATS].sort());
  });

  it.each(Object.keys(FIXTURES) as SupportedFormat[])(
    "%s: a second run over unchanged source rewrites nothing",
    async (format) => {
      const fixture = FIXTURES[format];
      const config = configFor(fixture, format);
      const dir = await seedSource(fixture, config);

      const first = await pseudolocalize({ config, cwd: dir });
      const afterFirst = await readFile(first.path, "utf8");
      const second = await pseudolocalize({ config, cwd: dir });
      const third = await pseudolocalize({ config, cwd: dir });

      expect(first.written).toBe(true);
      expect(second.written).toBe(false);
      expect(third.written).toBe(false);
      expect(await readFile(second.path, "utf8")).toBe(afterFirst);
    },
  );

  it("puts every output under the ignored local directory", async () => {
    const fixture = FIXTURES["i18next-json"];
    const config = configFor(fixture, "i18next-json");
    const dir = await seedSource(fixture, config);

    const result = await pseudolocalize({ config, cwd: dir });

    expect(result.path.startsWith(join(dir, ".verbatra-local", "pseudo"))).toBe(true);
  });
});

const RLM = "\u200f";
const RLO = "\u202e";
const PDF = "\u202c";
const BIDI_CONTROL = /[\u200f\u202c\u202e]/g;

function overridden(word: string): string {
  return `${RLM}${RLO}${word}${PDF}${RLM}`;
}

async function bidiRun(format: SupportedFormat) {
  const fixture = FIXTURES[format];
  const config = configFor(fixture, format);
  const dir = await seedSource(fixture, config);
  const source = await readFile(
    createLocalePathResolver(dir, config).pathFor(config.sourceLocale),
    "utf8",
  );
  const result = await pseudolocalize({ config, cwd: dir, mode: "bidi" });
  const written = await selectAdapter(format).read(result.path, result.locale);
  return { dir, config, source, result, written };
}

describe("pseudolocalize in bidi mode writes a right-to-left pseudolocale for every supported format", () => {
  it.each(Object.keys(FIXTURES) as SupportedFormat[])("%s", async (format) => {
    const fixture = FIXTURES[format];
    const { result, written } = await bidiRun(format);
    const value = written.resource.entries.get(fixture.key)?.value ?? "";

    expect(result).toMatchObject({ locale: "ar-XB", mode: "bidi", written: true, copied: [] });
    expect(result.transformed).toBe(result.entries);
    expect(value).toContain(`${overridden("Hello")} ${fixture.token} ${overridden("and")}`);
    expect(value).toContain(overridden("welcome"));
    expect(value.replace(BIDI_CONTROL, "")).toBe(`Hello ${fixture.token} and welcome`);
    if (fixture.pluralKey !== undefined) {
      const forms = (written.resource.entries.get(fixture.pluralKey)?.value ?? "").split("|");
      expect(forms.map((form) => form.trim())).toEqual([overridden("car"), overridden("cars")]);
    }
  });

  it.each(Object.keys(FIXTURES) as SupportedFormat[])(
    "%s: a second bidi run over unchanged source rewrites nothing",
    async (format) => {
      const { config, dir, result } = await bidiRun(format);
      const afterFirst = await readFile(result.path, "utf8");
      const second = await pseudolocalize({ config, cwd: dir, mode: "bidi" });

      expect(second.written).toBe(false);
      expect(await readFile(second.path, "utf8")).toBe(afterFirst);
    },
  );

  it("i18next JSON: stores the controls as characters and leaves the placeholder outside them", async () => {
    const { result } = await bidiRun("i18next-json");

    expect(JSON.parse(await readFile(result.path, "utf8"))).toEqual({
      greeting: `${overridden("Hello")} {{name}} ${overridden("and")} ${overridden("welcome")}`,
    });
  });

  it("Android XML: writes values-ar-rXB with the printf placeholder outside the override", async () => {
    const { dir, result } = await bidiRun("android-xml");

    expect(result.path).toBe(
      join(dir, ".verbatra-local", "pseudo", "res", "values-ar-rXB", "strings.xml"),
    );
    expect(await readFile(result.path, "utf8")).toContain(
      `${overridden("Hello")} %1$s ${overridden("and")} ${overridden("welcome")}`,
    );
  });

  it("gettext: writes the msgstr with the printf placeholder outside the override", async () => {
    const { result } = await bidiRun("gettext-po");

    expect(await readFile(result.path, "utf8")).toContain(
      `msgstr "${overridden("Hello")} %s ${overridden("and")} ${overridden("welcome")}"`,
    );
  });

  it("next-intl: overrides the text of each ICU plural arm and keeps the syntax", async () => {
    const { written } = await bidiRun("next-intl-json");

    expect(written.resource.entries.get("items")?.value).toBe(
      `{count, plural, one {# ${overridden("item")} ${overridden("left")}} other {# ${overridden("items")} ${overridden("left")}}}`,
    );
  });
});
