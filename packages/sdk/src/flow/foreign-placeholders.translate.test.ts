import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  createLibreTranslateProvider,
  type LibreTranslateDeps,
  type TranslationProvider,
} from "@verbatra/ai-providers";
import type { SupportedFormat, TranslationEntry } from "@verbatra/core";
import { createDefaultRegistry, createFlatFileAdapter } from "@verbatra/format-adapters";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import { createLocalePathResolver } from "../locale-path/resolver.js";
import { baseConfig, makeStubProvider, makeTempDir } from "../test-support.js";
import type { RunSummary } from "./summary.js";
import { translate } from "./translate-project.js";

interface Fixture {
  readonly format: SupportedFormat;
  readonly pattern: string;
  readonly localeStyle?: "android";
  readonly content: string;
  readonly token: string;
}

const RESX = `<?xml version="1.0" encoding="utf-8"?>
<root>
  <resheader name="resmimetype">
    <value>text/microsoft-resx</value>
  </resheader>
  <resheader name="version">
    <value>2.0</value>
  </resheader>
  <data name="greeting" xml:space="preserve">
    <value>Use {{x}} for {0}</value>
  </data>
</root>
`;

const I18NEXT: Fixture = {
  format: "i18next-json",
  pattern: "locales/{locale}.json",
  content: `${JSON.stringify({ greeting: "Hello {name}, welcome back!" })}\n`,
  token: "{name}",
};

const FLAGGED: readonly Fixture[] = [
  I18NEXT,
  {
    format: "yaml",
    pattern: "locales/{locale}.yaml",
    content: 'greeting: "%{count} items are waiting"\n',
    token: "%{count}",
  },
  {
    format: "gettext-po",
    pattern: "locales/{locale}.po",
    content:
      'msgid ""\nmsgstr "Content-Type: text/plain; charset=UTF-8\\n"\n\nmsgid "greeting"\nmsgstr "Hello {name}, welcome back!"\n',
    token: "{name}",
  },
  {
    format: "android-xml",
    pattern: "res/{locale}/strings.xml",
    localeStyle: "android",
    content:
      '<?xml version="1.0" encoding="utf-8"?>\n<resources><string name="greeting">Hello {name}, welcome back!</string></resources>\n',
    token: "{name}",
  },
];

function configFor(fixture: Fixture, overrides: Partial<VerbatraConfig> = {}): VerbatraConfig {
  return baseConfig({
    format: fixture.format,
    targetLocales: ["de"],
    files: {
      pattern: fixture.pattern,
      ...(fixture.localeStyle !== undefined ? { localeStyle: fixture.localeStyle } : {}),
    },
    provider: { id: "libretranslate", options: { baseUrl: "http://127.0.0.1:5000" } },
    ...overrides,
  });
}

async function seed(content: string, config: VerbatraConfig): Promise<string> {
  const dir = await makeTempDir();
  const path = createLocalePathResolver(dir, config).pathFor(config.sourceLocale);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
  return dir;
}

function libreTranslate(transform: (text: string) => string): TranslationProvider {
  const client: NonNullable<LibreTranslateDeps["client"]> = {
    translate: async (texts) => ({ status: 200, body: { translatedText: texts.map(transform) } }),
  };
  return createLibreTranslateProvider({ baseUrl: "http://127.0.0.1:5000" }, { client });
}

async function run(fixture: Fixture, transform: (text: string) => string): Promise<RunSummary> {
  const config = configFor(fixture);
  const dir = await seed(fixture.content, config);
  return translate({ config, cwd: dir }, { createProvider: () => libreTranslate(transform) });
}

function reasonsOf(summary: RunSummary, key: string): readonly string[] {
  return summary.locales[0]?.needsReview.find((entry) => entry.key === key)?.reasons ?? [];
}

describe("translate flags a dropped placeholder of a foreign syntax", () => {
  it.each(FLAGGED)("$format: a result without $token is flagged", async (fixture) => {
    const summary = await run(fixture, (text) => text.replace(fixture.token, "").trim());

    expect(summary.succeeded).toEqual(["de"]);
    expect(reasonsOf(summary, "greeting")).toContain("FOREIGN_PLACEHOLDER_CHANGED");
  });

  it.each(FLAGGED)("$format: a result keeping $token is not flagged", async (fixture) => {
    const summary = await run(fixture, (text) => `DE ${text}`);

    expect(summary.succeeded).toEqual(["de"]);
    expect(reasonsOf(summary, "greeting")).not.toContain("FOREIGN_PLACEHOLDER_CHANGED");
  });

  it("resx: a dropped {{x}} brace escape is never flagged", async () => {
    const fixture: Fixture = {
      format: "resx",
      pattern: "locales/{locale}.resx",
      content: RESX,
      token: "{{x}}",
    };

    const summary = await run(fixture, (text) => text.replace("{{x}}", "x"));

    expect(summary.succeeded).toEqual(["de"]);
    expect(reasonsOf(summary, "greeting")).not.toContain("FOREIGN_PLACEHOLDER_CHANGED");
  });
});

describe("translate reports pending source values that hold a foreign placeholder", () => {
  async function i18nextProject(source: Record<string, string>): Promise<string> {
    return seed(`${JSON.stringify(source)}\n`, configFor(I18NEXT));
  }

  function sourceNotices(locales: RunSummary["locales"]) {
    return locales.flatMap((locale) =>
      locale.notices.filter((notice) => notice.code === "SOURCE_FOREIGN_PLACEHOLDERS"),
    );
  }

  it("raises the notice on each locale with pending keys that hold one, naming them", async () => {
    const dir = await i18nextProject({
      greeting: "Hello {name}",
      plain: "Save",
      total: "%s items",
    });
    const config = baseConfig({ targetLocales: ["de", "fr"] });
    const stub = makeStubProvider();

    const summary = await translate({ config, cwd: dir }, { createProvider: () => stub.provider });

    expect(summary.locales.map((locale) => [locale.locale, sourceNotices([locale])])).toEqual([
      ["de", [expect.objectContaining({ code: "SOURCE_FOREIGN_PLACEHOLDERS" })]],
      ["fr", [expect.objectContaining({ code: "SOURCE_FOREIGN_PLACEHOLDERS" })]],
    ]);
    expect(sourceNotices(summary.locales)[0]?.message).toContain("2 source values hold");
    expect(sourceNotices(summary.locales)[0]?.message).toContain('"greeting", "total"');
  });

  it("stays silent for a locale with nothing pending", async () => {
    const dir = await i18nextProject({ greeting: "Hello {name}" });
    const config = baseConfig({ targetLocales: ["de", "fr"] });
    const stub = makeStubProvider();
    await translate({ config, cwd: dir, locales: ["de"] }, { createProvider: () => stub.provider });

    const summary = await translate({ config, cwd: dir }, { createProvider: () => stub.provider });

    expect(
      summary.locales.map((locale) => [locale.locale, sourceNotices([locale]).length]),
    ).toEqual([
      ["de", 0],
      ["fr", 1],
    ]);
  });

  it("raises it on a dry run too, before anything is spent", async () => {
    const dir = await i18nextProject({ greeting: "Hello {name}" });

    const summary = await translate({ config: configFor(I18NEXT), cwd: dir, dryRun: true });

    expect(sourceNotices(summary.locales)).toHaveLength(1);
  });

  it("raises it in human-only mode, whatever the provider", async () => {
    const dir = await i18nextProject({ greeting: "Hello {name}" });
    const config = baseConfig({ provider: { id: "none", options: {} } });

    const summary = await translate({ config, cwd: dir });

    expect(sourceNotices(summary.locales)).toHaveLength(1);
  });

  it("is absent when no source value holds a foreign token", async () => {
    const dir = await i18nextProject({ greeting: "Hello {{name}}", sale: "50%off" });
    const stub = makeStubProvider();

    const summary = await translate(
      { config: baseConfig(), cwd: dir },
      { createProvider: () => stub.provider },
    );

    expect(sourceNotices(summary.locales)).toEqual([]);
  });

  it("is absent for a third-party format, which verbatra cannot classify", async () => {
    const kv = createFlatFileAdapter({
      format: "custom:kv",
      extensions: [".kv"],
      parseEntries: (content, namespace) => {
        const entries = new Map<string, TranslationEntry>();
        for (const [key = "", value = ""] of content
          .split("\n")
          .filter((line) => line.includes("="))
          .map((line) => line.split("="))) {
          entries.set(key, { key, namespace, value, placeholders: [], isPlural: false });
        }
        return entries;
      },
      serializeEntries: (entries) =>
        `${[...entries].map(([key, entry]) => `${key}=${entry.value}`).join("\n")}\n`,
      extractPlaceholders: () => [],
    });
    const config = baseConfig({ format: "custom:kv", files: { pattern: "locales/{locale}.kv" } });
    const dir = await seed("greeting=Hello {name} and %s\n", config);
    const stub = makeStubProvider();

    const summary = await translate(
      { config, cwd: dir },
      {
        createProvider: () => stub.provider,
        adapterRegistry: createDefaultRegistry().register(kv),
      },
    );

    expect(summary.succeeded).toEqual(["de"]);
    expect(sourceNotices(summary.locales)).toEqual([]);
  });
});
