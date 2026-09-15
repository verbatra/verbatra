import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type Consumer,
  JSON_ENVELOPE_VERSION,
  parseEnvelope,
  readJsonIn,
  readSharedConsumer,
  runVerbatra,
  writeFileIn,
  writeJsonIn,
} from "../src/harness.js";

interface ImportTmxJson {
  dryRun: boolean;
  file: string;
  sourceLanguage: string | undefined;
  units: number;
  locales: {
    locale: string;
    added: number;
    unchanged: number;
    overwritten: number;
    kept: number;
    duplicates: number;
    rejected: Record<string, number>;
  }[];
  skippedUnits: number;
  unmatchedSourceUnits: number;
  markupStrippedUnits: number;
  unmatchedLanguages: { language: string; units: number }[];
  ambiguousLanguages: { language: string; units: number }[];
  memoryWritable: boolean;
}

interface RunSummaryJson {
  locales: { locale: string; cacheHits: string[]; translated: string[] }[];
}

interface ExportTmxJson {
  path: string;
  units: number;
  locales: { locale: string; units: number }[];
  withoutSource: number;
}

const config = {
  sourceLocale: "en",
  targetLocales: ["de", "fr"],
  format: "i18next-json",
  files: { pattern: "locales/{locale}.json" },
  provider: { id: "gemini", options: { model: "gemini-2.5-flash", maxOutputTokens: 4096 } },
};

const UNUSABLE_KEY = "not-a-real-key-and-never-sent-anywhere";

const NO_KEYS: Record<string, string> = {
  ANTHROPIC_API_KEY: "",
  OPENAI_API_KEY: "",
  GEMINI_API_KEY: "",
  DEEPL_API_KEY: "",
  GOOGLE_TRANSLATE_API_KEY: "",
  OPENAI_COMPATIBLE_API_KEY: "",
};

function tmxFile(units: readonly string[], srclang = "en-US"): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE tmx SYSTEM "tmx14.dtd">',
    '<tmx version="1.4">',
    `  <header srclang="${srclang}" creationtool="other-tool" creationtoolversion="2024.3" segtype="sentence" o-tmf="TMX" adminlang="en" datatype="plaintext"/>`,
    "  <body>",
    ...units,
    "  </body>",
    "</tmx>",
    "",
  ].join("\n");
}

function unit(pairs: ReadonlyArray<readonly [string, string]>): string {
  return `    <tu>\n${pairs
    .map(([lang, seg]) => `      <tuv xml:lang="${lang}"><seg>${seg}</seg></tuv>`)
    .join("\n")}\n    </tu>`;
}

let consumer: Consumer;

async function seedProject(name: string, source: Record<string, string>): Promise<string> {
  const dir = join(consumer.dir, name);
  await writeJsonIn(dir, ".verbatrarc.json", config);
  await writeJsonIn(dir, "locales/en.json", source);
  return dir;
}

function importPayload(stdout: string): ImportTmxJson {
  const envelope = parseEnvelope<ImportTmxJson>(stdout);
  if (!envelope.ok) {
    throw new Error(`Expected a tmx success envelope, got [${envelope.code}] ${envelope.message}`);
  }
  expect(envelope.version).toBe(JSON_ENVELOPE_VERSION);
  expect(envelope.command).toBe("tmx");
  return envelope.result;
}

function exportPayload(stdout: string): ExportTmxJson {
  const envelope = parseEnvelope<ExportTmxJson>(stdout);
  if (!envelope.ok) {
    throw new Error(`Expected a tmx success envelope, got [${envelope.code}] ${envelope.message}`);
  }
  return envelope.result;
}

beforeAll(async () => {
  consumer = await readSharedConsumer();
});

describe("tmx interchange in an installed consumer", () => {
  it("imports a third-party file, then exports an equivalent one, with no key in the environment", async () => {
    const dir = await seedProject("tmx-round-trip", {
      greeting: "Hello",
      farewell: "Goodbye",
      terms: "Terms & conditions",
    });
    await writeFileIn(
      dir,
      "legacy.tmx",
      tmxFile([
        unit([
          ["en-US", "Hello"],
          ["de-DE", "Hallo"],
          ["fr-FR", "Bonjour"],
        ]),
        unit([
          ["en-US", "Goodbye"],
          ["de-DE", "Auf Wiedersehen"],
        ]),
        unit([
          ["en-US", "Terms &amp; conditions"],
          ["de-DE", "Nutzungsbedingungen"],
        ]),
        unit([
          ["en-US", "Only Japanese here"],
          ["ja", "ここだけ日本語"],
        ]),
      ]),
    );

    const imported = await runVerbatra(consumer, ["tmx", "import", "legacy.tmx", "--json"], {
      cwd: dir,
      env: NO_KEYS,
    });

    expect(imported.exitCode).toBe(0);
    const report = importPayload(imported.stdout);
    expect(report.sourceLanguage).toBe("en-US");
    expect(report.units).toBe(4);
    expect(report.memoryWritable).toBe(true);
    expect(report.locales.map((locale) => [locale.locale, locale.added])).toEqual([
      ["de", 3],
      ["fr", 1],
    ]);
    expect(report.unmatchedLanguages).toEqual([{ language: "ja", units: 1 }]);

    const exported = await runVerbatra(consumer, ["tmx", "export", "out/memory.tmx", "--json"], {
      cwd: dir,
      env: NO_KEYS,
    });

    expect(exported.exitCode).toBe(0);
    const written = exportPayload(exported.stdout);
    expect(written.units).toBe(3);
    expect(written.locales).toEqual([
      { locale: "de", units: 3 },
      { locale: "fr", units: 1 },
    ]);
    expect(written.withoutSource).toBe(0);

    const text = await readFile(join(dir, "out", "memory.tmx"), "utf8");
    expect(text).toContain('<tmx version="1.4">');
    expect(text).toContain('srclang="en"');
    expect(text).toContain('creationtool="verbatra"');
    expect(text).toContain("<seg>Terms &amp; conditions</seg>");
    expect(text).toContain("<seg>Nutzungsbedingungen</seg>");
    expect(text).toContain("<seg>Bonjour</seg>");
  });

  it("reuses an imported unit on a later run, so nothing is sent to a provider", async () => {
    const dir = await seedProject("tmx-reuse", { greeting: "Hello", farewell: "Goodbye" });
    await writeFileIn(
      dir,
      "legacy.tmx",
      tmxFile([
        unit([
          ["en-US", "Hello"],
          ["de-DE", "Hallo"],
          ["fr-FR", "Bonjour"],
        ]),
        unit([
          ["en-US", "Goodbye"],
          ["de-DE", "Tschuess"],
          ["fr-FR", "Au revoir"],
        ]),
      ]),
    );
    await runVerbatra(consumer, ["tmx", "import", "legacy.tmx"], { cwd: dir, env: NO_KEYS });

    const translated = await runVerbatra(consumer, ["translate", "--json"], {
      cwd: dir,
      env: { ...NO_KEYS, GEMINI_API_KEY: UNUSABLE_KEY },
    });

    expect(translated.exitCode).toBe(0);
    const summary = parseEnvelope<RunSummaryJson>(translated.stdout);
    if (!summary.ok) {
      throw new Error(`Expected a translate success envelope, got [${summary.code}]`);
    }
    for (const locale of summary.result.locales) {
      expect(locale.cacheHits.slice().sort()).toEqual(["farewell", "greeting"]);
      expect(locale.translated).toEqual([]);
    }
    expect(await readJsonIn(dir, "locales/de.json")).toEqual({
      greeting: "Hallo",
      farewell: "Tschuess",
    });
    expect(await readJsonIn(dir, "locales/fr.json")).toEqual({
      greeting: "Bonjour",
      farewell: "Au revoir",
    });
  });

  it("would have failed that run had anything been sent, which is what the unusable key proves", async () => {
    const dir = await seedProject("tmx-reuse-control", { greeting: "Hello", uncovered: "Nothing" });
    await writeFileIn(
      dir,
      "legacy.tmx",
      tmxFile([
        unit([
          ["en-US", "Hello"],
          ["de-DE", "Hallo"],
          ["fr-FR", "Bonjour"],
        ]),
      ]),
    );
    await runVerbatra(consumer, ["tmx", "import", "legacy.tmx"], { cwd: dir, env: NO_KEYS });

    const translated = await runVerbatra(consumer, ["translate", "--json"], {
      cwd: dir,
      env: { ...NO_KEYS, GEMINI_API_KEY: UNUSABLE_KEY },
    });

    expect(translated.exitCode).not.toBe(0);
    expect(await readJsonIn(dir, "locales/de.json")).toEqual({ greeting: "Hallo" });
  });

  it("re-imports its own export into an equivalent memory", async () => {
    const dir = await seedProject("tmx-reimport", { greeting: "Hello" });
    await writeFileIn(
      dir,
      "legacy.tmx",
      tmxFile([
        unit([
          ["en-US", "Hello"],
          ["de-DE", "Hallo"],
        ]),
      ]),
    );
    await runVerbatra(consumer, ["tmx", "import", "legacy.tmx"], { cwd: dir, env: NO_KEYS });
    await runVerbatra(consumer, ["tmx", "export", "own.tmx"], { cwd: dir, env: NO_KEYS });
    const before = await readFile(join(dir, "verbatra.cache.json"), "utf8");

    const reimported = await runVerbatra(consumer, ["tmx", "import", "own.tmx", "--json"], {
      cwd: dir,
      env: NO_KEYS,
    });

    expect(reimported.exitCode).toBe(0);
    const report = importPayload(reimported.stdout);
    expect(report.locales[0]).toMatchObject({ added: 0, unchanged: 1, kept: 0, overwritten: 0 });
    expect(await readFile(join(dir, "verbatra.cache.json"), "utf8")).toBe(before);
  });

  it("keeps what the project already holds unless overwrite is asked for", async () => {
    const dir = await seedProject("tmx-collision", { greeting: "Hello" });
    await writeFileIn(
      dir,
      "first.tmx",
      tmxFile([
        unit([
          ["en-US", "Hello"],
          ["de-DE", "Hallo"],
        ]),
      ]),
    );
    await writeFileIn(
      dir,
      "second.tmx",
      tmxFile([
        unit([
          ["en-US", "Hello"],
          ["de-DE", "Moin"],
        ]),
      ]),
    );
    await runVerbatra(consumer, ["tmx", "import", "first.tmx"], { cwd: dir, env: NO_KEYS });

    const kept = await runVerbatra(consumer, ["tmx", "import", "second.tmx", "--json"], {
      cwd: dir,
      env: NO_KEYS,
    });
    expect(importPayload(kept.stdout).locales[0]).toMatchObject({ kept: 1, overwritten: 0 });

    const overwritten = await runVerbatra(
      consumer,
      ["tmx", "import", "second.tmx", "--overwrite", "--json"],
      { cwd: dir, env: NO_KEYS },
    );
    expect(importPayload(overwritten.stdout).locales[0]).toMatchObject({
      kept: 0,
      overwritten: 1,
    });
  });

  it("refuses a file that declares an XML entity, without reading the file it names", async () => {
    const dir = await seedProject("tmx-xxe", { greeting: "Hello" });
    await writeFileIn(
      dir,
      "hostile.tmx",
      [
        '<?xml version="1.0"?>',
        '<!DOCTYPE tmx [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>',
        '<tmx version="1.4"><header srclang="en"/><body>',
        '<tu><tuv xml:lang="en"><seg>&xxe;</seg></tuv><tuv xml:lang="de"><seg>x</seg></tuv></tu>',
        "</body></tmx>",
      ].join("\n"),
    );

    const result = await runVerbatra(consumer, ["tmx", "import", "hostile.tmx", "--json"], {
      cwd: dir,
      env: NO_KEYS,
    });

    expect(result.exitCode).toBe(2);
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.ok).toBe(false);
    expect(result.stderr).toContain("entity");
    expect(result.stdout).not.toContain("root:");
    await expect(readFile(join(dir, "verbatra.cache.json"), "utf8")).rejects.toThrow();
  });

  it("refuses a translation whose placeholders do not match its own source", async () => {
    const dir = await seedProject("tmx-gate", { greeting: "Hello {{name}}" });
    await writeFileIn(
      dir,
      "lossy.tmx",
      tmxFile([
        unit([
          ["en-US", "Hello {{name}}"],
          ["de-DE", "Hallo"],
        ]),
      ]),
    );

    const result = await runVerbatra(consumer, ["tmx", "import", "lossy.tmx", "--json"], {
      cwd: dir,
      env: NO_KEYS,
    });

    expect(result.exitCode).toBe(0);
    const report = importPayload(result.stdout);
    expect(report.locales[0]?.rejected.placeholder).toBe(1);
    expect(report.locales[0]?.added).toBe(0);
    await expect(readFile(join(dir, "verbatra.cache.json"), "utf8")).rejects.toThrow();
  });

  it("writes a valid empty document from an empty memory", async () => {
    const dir = await seedProject("tmx-empty", { greeting: "Hello" });

    const result = await runVerbatra(consumer, ["tmx", "export", "--json"], {
      cwd: dir,
      env: NO_KEYS,
    });

    expect(result.exitCode).toBe(0);
    expect(exportPayload(result.stdout).units).toBe(0);
    const text = await readFile(join(dir, "verbatra-memory.tmx"), "utf8");
    expect(text).toContain("<body>");
    expect(text).not.toContain("<tu>");
  });

  it("changes nothing on a dry run", async () => {
    const dir = await seedProject("tmx-dry-run", { greeting: "Hello" });
    await writeFileIn(
      dir,
      "legacy.tmx",
      tmxFile([
        unit([
          ["en-US", "Hello"],
          ["de-DE", "Hallo"],
        ]),
      ]),
    );

    const result = await runVerbatra(
      consumer,
      ["tmx", "import", "legacy.tmx", "--dry-run", "--json"],
      { cwd: dir, env: NO_KEYS },
    );

    expect(result.exitCode).toBe(0);
    const report = importPayload(result.stdout);
    expect(report.dryRun).toBe(true);
    expect(report.locales[0]?.added).toBe(1);
    await expect(readFile(join(dir, "verbatra.cache.json"), "utf8")).rejects.toThrow();
  });
});
