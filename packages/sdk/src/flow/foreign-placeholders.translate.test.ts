import { mkdir, readFile, writeFile } from "node:fs/promises";
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
import {
  baseConfig,
  makeIntegrityProvider,
  makeStubProvider,
  makeTempDir,
} from "../test-support.js";
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

interface Wire {
  readonly sent: string[];
  readonly provider: TranslationProvider;
}

function libreTranslate(transform: (text: string) => string): Wire {
  const sent: string[] = [];
  const client: NonNullable<LibreTranslateDeps["client"]> = {
    translate: async (texts) => {
      sent.push(...texts);
      return { status: 200, body: { translatedText: texts.map(transform) } };
    },
  };
  return {
    sent,
    provider: createLibreTranslateProvider({ baseUrl: "http://127.0.0.1:5000" }, { client }),
  };
}

interface Run {
  readonly summary: RunSummary;
  readonly sent: readonly string[];
  readonly written: string;
}

async function runWith(fixture: Fixture, provider: TranslationProvider): Promise<RunSummary> {
  const config = configFor(fixture);
  const dir = await seed(fixture.content, config);
  return translate({ config, cwd: dir }, { createProvider: () => provider });
}

async function run(fixture: Fixture, transform: (text: string) => string): Promise<Run> {
  const config = configFor(fixture);
  const dir = await seed(fixture.content, config);
  const wire = libreTranslate(transform);
  const summary = await translate({ config, cwd: dir }, { createProvider: () => wire.provider });
  const written = await readFile(createLocalePathResolver(dir, config).pathFor("de"), "utf8").catch(
    () => "",
  );
  return { summary, sent: wire.sent, written };
}

function reasonsOf(summary: RunSummary, key: string): readonly string[] {
  return summary.locales[0]?.needsReview.find((entry) => entry.key === key)?.reasons ?? [];
}

function noticeCodes(summary: RunSummary): readonly string[] {
  return summary.locales.flatMap((locale) => locale.notices.map((notice) => notice.code));
}

const VUE_I18N: Fixture = {
  format: "vue-i18n-json",
  pattern: "locales/{locale}.json",
  content: `${JSON.stringify({ greeting: "Hello {name}, use {{x}} here" })}\n`,
  token: "{{x}}",
};

const MASKED: readonly Fixture[] = [...FLAGGED, VUE_I18N];

describe("translate masks a placeholder of a foreign syntax for machine translation", () => {
  it.each(MASKED)("$format: $token goes out as a marker and comes back intact", async (fixture) => {
    const { summary, sent, written } = await run(fixture, (text) => `DE ${text}`);

    expect(summary.succeeded).toEqual(["de"]);
    expect(sent.join("\n")).not.toContain(fixture.token);
    expect(sent.join("\n")).toMatch(/\{\d+\}/);
    expect(written).toContain(fixture.token);
    expect(reasonsOf(summary, "greeting")).not.toContain("FOREIGN_PLACEHOLDER_CHANGED");
  });

  it.each(MASKED)(
    "$format: a result that loses the marker is withheld, not written",
    async (fixture) => {
      const { summary, written } = await run(fixture, (text) => text.replace(/\{\d+\}/g, ""));

      expect(noticeCodes(summary)).toContain("PLACEHOLDER_UNSUPPORTED");
      expect(written).not.toContain("greeting");
    },
  );

  it("withholds a value whose foreign token cannot be masked, with the notice", async () => {
    const fixture: Fixture = {
      ...I18NEXT,
      content: `${JSON.stringify({ greeting: "{count, plural, one {# item} other {# items}}" })}\n`,
    };

    const { summary, sent, written } = await run(fixture, (text) => `DE ${text}`);

    expect(sent).toEqual([]);
    expect(noticeCodes(summary)).toContain("PLACEHOLDER_UNSUPPORTED");
    expect(written).not.toContain("greeting");
  });

  it("resx: a dropped {{x}} brace escape is never flagged", async () => {
    const fixture: Fixture = {
      format: "resx",
      pattern: "locales/{locale}.resx",
      content: RESX,
      token: "{{x}}",
    };

    const { summary } = await run(fixture, (text) => text.replace("{{x}}", "x"));

    expect(summary.succeeded).toEqual(["de"]);
    expect(reasonsOf(summary, "greeting")).not.toContain("FOREIGN_PLACEHOLDER_CHANGED");
  });
});

describe("translate flags a foreign token an LLM provider drops once, outside the integrity gate", () => {
  it.each(MASKED)("$format: a result without $token is flagged", async (fixture) => {
    const provider = makeIntegrityProvider((value) => value.replace(fixture.token, "").trim());

    const summary = await runWith(fixture, provider);

    expect(summary.locales[0]?.status).toBe("succeeded");
    expect(summary.locales[0]?.translated).toEqual(["greeting"]);
    expect(
      reasonsOf(summary, "greeting").filter((reason) => reason === "FOREIGN_PLACEHOLDER_CHANGED"),
    ).toHaveLength(1);
  });

  it.each(MASKED)("$format: a result keeping $token is not flagged", async (fixture) => {
    const summary = await runWith(
      fixture,
      makeIntegrityProvider((value) => `DE ${value}`),
    );

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
    expect(sourceNotices(summary.locales)[0]?.message).toContain("Machine translation is off");
    expect(sourceNotices(summary.locales)[0]?.message).not.toContain("during translation");
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
