import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { contentHash, type TranslationEntry } from "@verbatra/core";
import { buildWorkbook, type RowStatus, readWorkbook } from "@verbatra/exchange";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../../config/schema.js";
import { SdkError } from "../../errors.js";
import { defaultFs, type SdkFs } from "../../fs.js";
import { lockFilePath } from "../../lock/lock-file.js";
import {
  baseConfig,
  makeFakeFs,
  makeTempDir,
  readJsonFile,
  writeJsonFile,
} from "../../test-support.js";
import { check } from "../check.js";
import { exportWorkbook } from "./export-workbook.js";
import { importWorkbook } from "./import-workbook.js";

const cfg = (overrides: Partial<VerbatraConfig> = {}): VerbatraConfig =>
  baseConfig({ targetLocales: ["de", "fr"], format: "i18next-json", ...overrides });

async function project(
  source: Record<string, unknown>,
  targets: Record<string, Record<string, unknown> | undefined>,
): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), source);
  for (const [locale, obj] of Object.entries(targets)) {
    if (obj !== undefined) {
      await writeJsonFile(join(dir, "locales", `${locale}.json`), obj);
    }
  }
  return dir;
}

function entry(value: string, placeholders: readonly string[] = []): TranslationEntry {
  return { key: "k", namespace: "en", value, placeholders, isPlural: false };
}

async function fillWorkbook(
  path: string,
  locale: string,
  fills: Readonly<Record<string, string>>,
): Promise<void> {
  const data = await readWorkbook(new Uint8Array(await readFile(path)));
  const sheets = data.sheets.map((sheet) =>
    sheet.locale !== locale
      ? sheet
      : {
          locale: sheet.locale,
          rows: sheet.rows.map((row) =>
            fills[row.key] !== undefined ? { ...row, translation: fills[row.key] as string } : row,
          ),
        },
  );
  await writeFile(path, await buildWorkbook({ sheets }));
}

interface LockCorruptingFs {
  readonly fs: SdkFs;
  readonly lockWrites: readonly string[];
}

function lockCorruptingFs(path: string): LockCorruptingFs {
  const lockWrites: string[] = [];
  let reads = 0;
  const fs: SdkFs = {
    ...defaultFs,
    readFileBounded: async (target, maxBytes) => {
      if (target !== path) {
        return defaultFs.readFileBounded(target, maxBytes);
      }
      reads += 1;
      return { kind: "ok", content: reads === 1 ? '{"version":1,"locales":{}}' : "{ not json" };
    },
    writeFile: async (target, data) => {
      if (target === path) {
        lockWrites.push(data);
      }
      await defaultFs.writeFile(target, data);
    },
  };
  return { fs, lockWrites };
}

async function readLocaleFiles(
  dir: string,
  locales: readonly string[],
): Promise<Record<string, string>> {
  const contents: Record<string, string> = {};
  for (const locale of locales) {
    contents[locale] = await readFile(join(dir, "locales", `${locale}.json`), "utf8");
  }
  return contents;
}

describe("exportWorkbook", () => {
  it("exports one sheet per target locale with missing-and-changed rows by default", async () => {
    const dir = await project(
      { greeting: "Hello", farewell: "Bye" },
      { de: { greeting: "Hallo" } },
    );
    const result = await exportWorkbook({ config: cfg(), cwd: dir });

    expect(result.path).toBe(join(dir, "verbatra-translations.xlsx"));
    const data = await readWorkbook(new Uint8Array(await readFile(result.path)));
    expect(data.sheets.map((s) => s.locale)).toEqual(["de", "fr"]);
    expect(data.sheets[0]?.rows.map((r) => r.key)).toEqual(["farewell"]);
    expect(data.sheets[1]?.rows.map((r) => r.key)).toEqual(["farewell", "greeting"]);
  });

  it("carries the source hash and status, and is deterministic across runs", async () => {
    const dir = await project({ a: "A", b: "B" }, { de: undefined });
    const r1 = await exportWorkbook({ config: cfg({ targetLocales: ["de"] }), cwd: dir });
    const data = await readWorkbook(new Uint8Array(await readFile(r1.path)));
    const row = data.sheets[0]?.rows.find((r) => r.key === "a");
    expect(row?.status).toBe("new");
    expect(row?.sourceHash).toBe(contentHash(entry("A")));

    await exportWorkbook({ config: cfg({ targetLocales: ["de"] }), cwd: dir });
    const again = await readWorkbook(new Uint8Array(await readFile(r1.path)));
    expect(again.sheets[0]?.rows.map((r) => r.key)).toEqual(data.sheets[0]?.rows.map((r) => r.key));
  });

  it("honors --locales and --include-unchanged, labeling the included row 'unchanged'", async () => {
    const dir = await project({ a: "A" }, { de: { a: "Aa" }, fr: { a: "Af" } });
    const result = await exportWorkbook({
      config: cfg(),
      cwd: dir,
      locales: ["de"],
      includeUnchanged: true,
    });
    expect(result.locales.map((l) => l.locale)).toEqual(["de"]);
    expect(result.locales[0]?.rows).toBe(1);

    const data = await readWorkbook(new Uint8Array(await readFile(result.path)));
    const row = data.sheets[0]?.rows.find((r) => r.key === "a");
    expect(row?.status).toBe("unchanged");
  });

  it("never emits an 'unchanged' status row when includeUnchanged is off or omitted", async () => {
    const dir = await project({ a: "A", b: "B" }, { de: { a: "Aa" } });
    const result = await exportWorkbook({ config: cfg({ targetLocales: ["de"] }), cwd: dir });
    const data = await readWorkbook(new Uint8Array(await readFile(result.path)));
    expect(data.sheets[0]?.rows.map((r) => r.key)).toEqual(["b"]);
    expect(data.sheets[0]?.rows.some((r) => r.status === "unchanged")).toBe(false);
  });

  it("produces a valid empty workbook when nothing needs translation", async () => {
    const dir = await project({ a: "A" }, { de: { a: "Aa" } });
    const result = await exportWorkbook({ config: cfg({ targetLocales: ["de"] }), cwd: dir });
    expect(result.locales[0]?.rows).toBe(0);
    const data = await readWorkbook(new Uint8Array(await readFile(result.path)));
    expect(data.sheets[0]?.rows).toHaveLength(0);
  });

  it("exports a baseline key whose source drifted with status 'changed'", async () => {
    const dir = await project({ a: "A new" }, { de: { a: "Aa" } });
    const config = cfg({ targetLocales: ["de"] });
    await writeJsonFile(join(dir, "verbatra.lock.json"), {
      version: 1,
      locales: { de: { a: contentHash(entry("A old")) } },
    });

    const result = await exportWorkbook({ config, cwd: dir });
    const data = await readWorkbook(new Uint8Array(await readFile(result.path)));
    const row = data.sheets[0]?.rows.find((r) => r.key === "a");
    expect(row?.status).toBe("changed");
    expect(row?.currentTarget).toBe("Aa");
  });

  it("creates the output directory, including a missing parent, before writing the workbook", async () => {
    const dir = await project({ a: "A" }, { de: { a: "Aa" } });
    const result = await exportWorkbook({
      config: cfg({ targetLocales: ["de"] }),
      cwd: dir,
      out: join("nested", "missing", "out.xlsx"),
    });

    expect(result.path).toBe(join(dir, "nested", "missing", "out.xlsx"));
    const data = await readWorkbook(new Uint8Array(await readFile(result.path)));
    expect(data.sheets.map((s) => s.locale)).toEqual(["de"]);
  });

  it("lets the file-system error through unwrapped when the handoff itself cannot be written", async () => {
    const dir = await project({ a: "A" }, { de: { a: "Aa" } });
    const fakeFs = makeFakeFs({
      fileExists: defaultFs.fileExists,
      readFileBounded: defaultFs.readFileBounded,
      readBytesBounded: defaultFs.readBytesBounded,
      writeBytes: async (): Promise<void> => {
        throw Object.assign(new Error("disk full"), { code: "ENOSPC" });
      },
    });

    const rejection = await exportWorkbook(
      { config: cfg({ targetLocales: ["de"] }), cwd: dir },
      { fs: fakeFs },
    ).then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(rejection).toBeInstanceOf(Error);
    expect(rejection).not.toBeInstanceOf(SdkError);
    expect(rejection).toMatchObject({ code: "ENOSPC" });
  });

  it("rejects an unknown requested locale with UNKNOWN_LOCALE instead of silently dropping it", async () => {
    const dir = await project({ a: "A" }, { de: { a: "Aa" }, fr: { a: "Af" } });
    await expect(
      exportWorkbook({ config: cfg(), cwd: dir, locales: ["de", "es"] }),
    ).rejects.toMatchObject({ code: "UNKNOWN_LOCALE" });
  });

  it("carries the source entry's description into the Context column", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, "locales"));
    await writeJsonFile(join(dir, "locales", "en.arb"), {
      greeting: "Hello",
      "@greeting": { description: "A friendly greeting shown on the home screen" },
    });
    const config = cfg({
      targetLocales: ["de"],
      format: "arb",
      files: { pattern: "locales/{locale}.arb" },
    });

    const result = await exportWorkbook({ config, cwd: dir });
    const data = await readWorkbook(new Uint8Array(await readFile(result.path)));
    const row = data.sheets[0]?.rows.find((r) => r.key === "greeting");
    expect(row?.context).toBe("A friendly greeting shown on the home screen");
  });

  it("leaves the Context column empty when the source entry carries no description", async () => {
    const dir = await project({ greeting: "Hello" }, { de: undefined });
    const result = await exportWorkbook({ config: cfg({ targetLocales: ["de"] }), cwd: dir });
    const data = await readWorkbook(new Uint8Array(await readFile(result.path)));
    const row = data.sheets[0]?.rows.find((r) => r.key === "greeting");
    expect(row?.context).toBe("");
  });

  it("exports reviewStatus 'ok' and empty reviewReasons for a row with no current target", async () => {
    const dir = await project({ greeting: "Hello there, friend" }, { de: undefined });
    const result = await exportWorkbook({ config: cfg({ targetLocales: ["de"] }), cwd: dir });
    const data = await readWorkbook(new Uint8Array(await readFile(result.path)));
    const row = data.sheets[0]?.rows.find((r) => r.key === "greeting");
    expect(row?.status).toBe("new");
    expect(row?.currentTarget).toBe("");
    expect(row?.reviewStatus).toBe("ok");
    expect(row?.reviewReasons).toBe("");
  });

  it("recomputes EQUALS_SOURCE for a changed row whose current target equals the source", async () => {
    const dir = await project({ a: "Hello there, friend" }, { de: { a: "Hello there, friend" } });
    const config = cfg({ targetLocales: ["de"] });
    await writeJsonFile(join(dir, "verbatra.lock.json"), {
      version: 1,
      locales: { de: { a: contentHash(entry("A old")) } },
    });

    const result = await exportWorkbook({ config, cwd: dir });
    const data = await readWorkbook(new Uint8Array(await readFile(result.path)));
    const row = data.sheets[0]?.rows.find((r) => r.key === "a");
    expect(row?.status).toBe("changed");
    expect(row?.reviewStatus).toBe("review");
    expect(row?.reviewReasons).toBe("equals-source");
  });

  it("recomputes LENGTH_RATIO_OUTLIER for a suspiciously short current target", async () => {
    const dir = await project({ a: "This is a fairly long source sentence" }, { de: { a: "x" } });
    const result = await exportWorkbook({
      config: cfg({ targetLocales: ["de"] }),
      cwd: dir,
      includeUnchanged: true,
    });
    const data = await readWorkbook(new Uint8Array(await readFile(result.path)));
    const row = data.sheets[0]?.rows.find((r) => r.key === "a");
    expect(row?.reviewStatus).toBe("review");
    expect(row?.reviewReasons).toContain("length-ratio-outlier");
  });

  it("recomputes GLOSSARY_TERM_MISSED using the configured glossary", async () => {
    const dir = await project(
      { a: "Click Save to continue" },
      { de: { a: "Klicken Sie zum Fortfahren" } },
    );
    const config = cfg({ targetLocales: ["de"], glossary: { Save: "Speichern" } });
    const result = await exportWorkbook({ config, cwd: dir, includeUnchanged: true });
    const data = await readWorkbook(new Uint8Array(await readFile(result.path)));
    const row = data.sheets[0]?.rows.find((r) => r.key === "a");
    expect(row?.reviewStatus).toBe("review");
    expect(row?.reviewReasons).toBe("glossary-term-missed");
  });

  it("recomputes INTEGRITY_REORDERED for a matched but reordered placeholder set", async () => {
    const dir = await project(
      { a: "Hi {{first}} and {{second}}" },
      { de: { a: "Hallo {{second}} und {{first}}" } },
    );
    const result = await exportWorkbook({
      config: cfg({ targetLocales: ["de"] }),
      cwd: dir,
      includeUnchanged: true,
    });
    const data = await readWorkbook(new Uint8Array(await readFile(result.path)));
    const row = data.sheets[0]?.rows.find((r) => r.key === "a");
    expect(row?.reviewStatus).toBe("review");
    expect(row?.reviewReasons).toBe("integrity-reordered");
  });

  it("exports reviewStatus 'ok' with empty reasons for a clean current target", async () => {
    const dir = await project({ a: "Hi there" }, { de: { a: "Hallo dort" } });
    const result = await exportWorkbook({
      config: cfg({ targetLocales: ["de"] }),
      cwd: dir,
      includeUnchanged: true,
    });
    const data = await readWorkbook(new Uint8Array(await readFile(result.path)));
    const row = data.sheets[0]?.rows.find((r) => r.key === "a");
    expect(row?.reviewStatus).toBe("ok");
    expect(row?.reviewReasons).toBe("");
  });

  it("falls back to flat extraction for a format whose adapter defines no comparator", async () => {
    const dir = await project(
      { a: "Hi {first} and {second}" },
      { de: { a: "Hallo {second} und {first}" } },
    );
    const result = await exportWorkbook({
      config: cfg({ targetLocales: ["de"], format: "vue-i18n-json" }),
      cwd: dir,
      includeUnchanged: true,
    });
    const data = await readWorkbook(new Uint8Array(await readFile(result.path)));
    const row = data.sheets[0]?.rows.find((r) => r.key === "a");
    expect(row?.reviewStatus).toBe("review");
    expect(row?.reviewReasons).toBe("integrity-reordered");
  });
});

describe("importWorkbook", () => {
  it("writes accepted values by key, updates the lock, reports orphaned, and the summary", async () => {
    const dir = await project(
      { greeting: "Hello", farewell: "Bye" },
      { de: { stale: "Veraltet" } },
    );
    const config = cfg({ targetLocales: ["de"] });
    const out = await exportWorkbook({ config, cwd: dir });
    await fillWorkbook(out.path, "de", { greeting: "Hallo", farewell: "Tschuss" });

    const summary = await importWorkbook({ config, workbook: out.path, cwd: dir });
    expect(summary.succeeded).toEqual(["de"]);
    expect(summary.locales[0]?.translated).toEqual(["farewell", "greeting"]);
    expect(summary.locales[0]?.orphaned).toEqual(["stale"]);

    const de = (await readJsonFile(join(dir, "locales", "de.json"))) as Record<string, string>;
    expect(de.greeting).toBe("Hallo");
    expect(de.farewell).toBe("Tschuss");
    expect(de.stale).toBe("Veraltet");

    const lock = (await readJsonFile(join(dir, "verbatra.lock.json"))) as {
      locales: Record<string, Record<string, string>>;
    };
    expect(Object.keys(lock.locales.de ?? {}).sort()).toEqual(["farewell", "greeting"]);
  });

  it("imports a legacy workbook built without the Context column", async () => {
    const dir = await project({ greeting: "Hello" }, { de: undefined });
    const config = cfg({ targetLocales: ["de"] });
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("de");
    ["Key", "Source", "Current translation", "Status", "Translation", "Source hash"].forEach(
      (label, index) => {
        sheet.getRow(1).getCell(index + 1).value = label;
      },
    );
    sheet.getRow(2).getCell(1).value = "greeting";
    sheet.getRow(2).getCell(2).value = "Hello";
    sheet.getRow(2).getCell(4).value = "new";
    sheet.getRow(2).getCell(5).value = "Hallo";
    sheet.getRow(2).getCell(6).value = contentHash(entry("Hello"));
    const path = join(dir, "legacy.xlsx");
    await workbook.xlsx.writeFile(path);

    const summary = await importWorkbook({ config, workbook: path, cwd: dir });
    expect(summary.succeeded).toEqual(["de"]);
    expect(summary.locales[0]?.translated).toEqual(["greeting"]);
  });

  it("bootstraps a baseline for an already-synced key with no prior lock entry", async () => {
    const dir = await project({ a: "A", b: "B" }, { de: { a: "Aa" } });
    const config = cfg({ targetLocales: ["de"] });
    const out = await exportWorkbook({ config, cwd: dir });
    await fillWorkbook(out.path, "de", { b: "Bb" });

    const summary = await importWorkbook({ config, workbook: out.path, cwd: dir });
    expect(summary.locales[0]?.translated).toEqual(["b"]);

    const lock = (await readJsonFile(join(dir, "verbatra.lock.json"))) as {
      locales: Record<string, Record<string, string>>;
    };
    expect(lock.locales.de?.a).toBe(contentHash(entry("A")));
    expect(lock.locales.de?.b).toBe(contentHash(entry("B")));
  });

  it("skips empty cells: not written, no lock entry, never an empty string", async () => {
    const dir = await project({ a: "A", b: "B" }, { de: undefined });
    const config = cfg({ targetLocales: ["de"] });
    const out = await exportWorkbook({ config, cwd: dir });
    await fillWorkbook(out.path, "de", { a: "Aa" });

    const summary = await importWorkbook({ config, workbook: out.path, cwd: dir });
    expect(summary.locales[0]?.translated).toEqual(["a"]);
    const de = (await readJsonFile(join(dir, "locales", "de.json"))) as Record<string, string>;
    expect(de.b).toBeUndefined();
  });

  it("withholds a placeholder mismatch: reported, not written, no lock entry", async () => {
    const dir = await project({ greet: "Hi {{name}}" }, { de: undefined });
    const config = cfg({ targetLocales: ["de"] });
    const out = await exportWorkbook({ config, cwd: dir });
    await fillWorkbook(out.path, "de", { greet: "Hallo" });

    const summary = await importWorkbook({ config, workbook: out.path, cwd: dir });
    expect(summary.locales[0]?.integrityMismatches).toEqual(["greet"]);
    expect(summary.locales[0]?.translated).toEqual([]);
    expect(summary.locales[0]?.status).toBe("failed");
    expect(summary.succeeded).toEqual([]);
    expect(summary.failed).toEqual(["de"]);
    await expect(readJsonFile(join(dir, "locales", "de.json"))).rejects.toThrow();
  });

  it("reports an import that accepts one row and withholds another as partial", async () => {
    const dir = await project({ ok: "Plain", greet: "Hi {{name}}" }, { de: undefined });
    const config = cfg({ targetLocales: ["de"] });
    const out = await exportWorkbook({ config, cwd: dir });
    await fillWorkbook(out.path, "de", { ok: "Klar", greet: "Hallo" });

    const summary = await importWorkbook({ config, workbook: out.path, cwd: dir });
    expect(summary.locales[0]?.translated).toEqual(["ok"]);
    expect(summary.locales[0]?.integrityMismatches).toEqual(["greet"]);
    expect(summary.locales[0]?.status).toBe("partial");
    expect(summary.partial).toEqual(["de"]);
    expect(summary.succeeded).toEqual([]);
  });

  it("withholds invalid ICU for an ICU format", async () => {
    const dir = await project(
      { items: "{n, plural, one {# item} other {# items}}" },
      { de: undefined },
    );
    const config = cfg({ targetLocales: ["de"], format: "next-intl-json" });
    const out = await exportWorkbook({ config, cwd: dir });
    await fillWorkbook(out.path, "de", { items: "{n, plural, one {x" });

    const summary = await importWorkbook({ config, workbook: out.path, cwd: dir });
    expect(summary.locales[0]?.integrityMismatches).toEqual(["items"]);
    expect(summary.locales[0]?.translated).toEqual([]);
  });

  it("withholds a drifted row when the source changed since export", async () => {
    const dir = await project({ a: "A" }, { de: undefined });
    const config = cfg({ targetLocales: ["de"] });
    const out = await exportWorkbook({ config, cwd: dir });
    await fillWorkbook(out.path, "de", { a: "Aa" });
    await writeJsonFile(join(dir, "locales", "en.json"), { a: "A changed" });

    const summary = await importWorkbook({ config, workbook: out.path, cwd: dir });
    expect(summary.locales[0]?.integrityMismatches).toEqual(["a"]);
    expect(summary.locales[0]?.translated).toEqual([]);
    await expect(readJsonFile(join(dir, "locales", "de.json"))).rejects.toThrow();
  });

  it("a withheld key with an existing target keeps its prior lock hash (not refreshed)", async () => {
    const dir = await project({ greet: "Hi {{name}}" }, { de: { greet: "Hallo {{name}}" } });
    const config = cfg({ targetLocales: ["de"] });
    const priorHash = contentHash(entry("Old source", ["{{name}}"]));
    await writeJsonFile(join(dir, "verbatra.lock.json"), {
      version: 1,
      locales: { de: { greet: priorHash } },
    });
    const out = await exportWorkbook({ config, cwd: dir });
    await fillWorkbook(out.path, "de", { greet: "Hallo" });

    const summary = await importWorkbook({ config, workbook: out.path, cwd: dir });
    expect(summary.locales[0]?.integrityMismatches).toEqual(["greet"]);

    const lock = (await readJsonFile(join(dir, "verbatra.lock.json"))) as {
      locales: Record<string, Record<string, string>>;
    };
    expect(lock.locales.de?.greet).toBe(priorHash);
    const de = (await readJsonFile(join(dir, "locales", "de.json"))) as Record<string, string>;
    expect(de.greet).toBe("Hallo {{name}}");
  });

  it("keeps a generated-plural lock hash through an export and import with nothing to fill", async () => {
    const dir = await project(
      { items_one: "{{count}} item", items_other: "{{count}} items" },
      {
        pl: {
          items_one: "{{count}} przedmiot",
          items_other: "{{count}} przedmiotow",
          items_few: "{{count}} przedmioty",
          items_many: "{{count}} przedmiotow",
        },
      },
    );
    const config = cfg({ targetLocales: ["pl"] });
    await writeJsonFile(join(dir, "verbatra.lock.json"), {
      version: 1,
      locales: { pl: { items_few: "generated-few-hash", items_many: "generated-many-hash" } },
    });

    const out = await exportWorkbook({ config, cwd: dir });
    const data = await readWorkbook(new Uint8Array(await readFile(out.path)));
    expect(data.sheets[0]?.rows).toEqual([]);

    await importWorkbook({ config, workbook: out.path, cwd: dir });

    const lock = (await readJsonFile(join(dir, "verbatra.lock.json"))) as {
      locales: Record<string, Record<string, string>>;
    };
    expect(lock.locales.pl?.items_few).toBe("generated-few-hash");
    expect(lock.locales.pl?.items_many).toBe("generated-many-hash");
  });

  it("drops the baseline hash of a source-less key the user deleted from the target file", async () => {
    const dir = await project({ greeting: "Hello" }, { de: { greeting: "Hallo" } });
    const config = cfg({ targetLocales: ["de"] });
    await writeJsonFile(join(dir, "verbatra.lock.json"), {
      version: 1,
      locales: { de: { deleted_few: "generated-few-hash" } },
    });
    const out = await exportWorkbook({ config, cwd: dir });

    await importWorkbook({ config, workbook: out.path, cwd: dir });

    const lock = (await readJsonFile(join(dir, "verbatra.lock.json"))) as {
      locales: Record<string, Record<string, string>>;
    };
    expect(lock.locales.de?.deleted_few).toBeUndefined();
  });

  it("keeps the prior lock baseline when a changed row is left blank", async () => {
    const dir = await project({ greeting: "Hello" }, { de: { greeting: "Hallo" } });
    const config = cfg({ targetLocales: ["de"] });
    const priorHash = contentHash(entry("Hello"));
    await writeJsonFile(join(dir, "verbatra.lock.json"), {
      version: 1,
      locales: { de: { greeting: priorHash } },
    });
    await writeJsonFile(join(dir, "locales", "en.json"), { greeting: "Hi there" });
    const out = await exportWorkbook({ config, cwd: dir });

    const summary = await importWorkbook({ config, workbook: out.path, cwd: dir });
    expect(summary.locales[0]?.translated).toEqual([]);

    const de = (await readJsonFile(join(dir, "locales", "de.json"))) as Record<string, string>;
    expect(de.greeting).toBe("Hallo");

    const lock = (await readJsonFile(join(dir, "verbatra.lock.json"))) as {
      locales: Record<string, Record<string, string>>;
    };
    expect(lock.locales.de?.greeting).toBe(priorHash);
    expect(lock.locales.de?.greeting).not.toBe(contentHash(entry("Hi there")));

    expect(summary.locales[0]?.notices).toEqual([
      expect.objectContaining({ code: "BLANK_ROW_BASELINE_RETAINED" }),
    ]);

    const checked = await check({ config, cwd: dir });
    expect(checked.locales[0]?.stale).toBe(1);
    expect(checked.inSync).toBe(false);
  });

  it("keeps every locale's prior baseline when the whole workbook is left blank", async () => {
    const dir = await project(
      { greeting: "Hello", farewell: "Bye" },
      {
        de: { greeting: "Hallo", farewell: "Tschuss" },
        fr: { greeting: "Salut", farewell: "Adieu" },
      },
    );
    const config = cfg({ targetLocales: ["de", "fr"] });
    const priorGreeting = contentHash(entry("Hello"));
    const priorFarewell = contentHash(entry("Bye"));
    await writeJsonFile(join(dir, "verbatra.lock.json"), {
      version: 1,
      locales: {
        de: { greeting: priorGreeting, farewell: priorFarewell },
        fr: { greeting: priorGreeting, farewell: priorFarewell },
      },
    });
    await writeJsonFile(join(dir, "locales", "en.json"), {
      greeting: "Hi there",
      farewell: "Goodbye",
    });
    const out = await exportWorkbook({ config, cwd: dir });

    const summary = await importWorkbook({ config, workbook: out.path, cwd: dir });
    expect(summary.locales.map((l) => l.translated)).toEqual([[], []]);

    const lock = (await readJsonFile(join(dir, "verbatra.lock.json"))) as {
      locales: Record<string, Record<string, string>>;
    };
    for (const locale of ["de", "fr"]) {
      expect(lock.locales[locale]?.greeting).toBe(priorGreeting);
      expect(lock.locales[locale]?.farewell).toBe(priorFarewell);
    }

    const de = (await readJsonFile(join(dir, "locales", "de.json"))) as Record<string, string>;
    const fr = (await readJsonFile(join(dir, "locales", "fr.json"))) as Record<string, string>;
    expect(de).toEqual({ greeting: "Hallo", farewell: "Tschuss" });
    expect(fr).toEqual({ greeting: "Salut", farewell: "Adieu" });

    for (const localeSummary of summary.locales) {
      expect(localeSummary.notices).toEqual([
        expect.objectContaining({ code: "BLANK_ROW_BASELINE_RETAINED" }),
      ]);
    }

    const checked = await check({ config, cwd: dir });
    expect(checked.inSync).toBe(false);
    expect(checked.locales.map((l) => l.stale)).toEqual([2, 2]);
  });

  it("accepts a filled 'unchanged' row exactly like a 'changed' row, branching on no status", async () => {
    const dir = await project({ a: "A" }, { de: { a: "Aa" } });
    const config = cfg({ targetLocales: ["de"] });
    const out = await exportWorkbook({ config, cwd: dir, includeUnchanged: true });
    await fillWorkbook(out.path, "de", { a: "Aa updated" });

    const summary = await importWorkbook({ config, workbook: out.path, cwd: dir });
    expect(summary.locales[0]?.translated).toEqual(["a"]);
    const de = (await readJsonFile(join(dir, "locales", "de.json"))) as Record<string, string>;
    expect(de.a).toBe("Aa updated");
  });

  it("dry-run validates and reports without writing the locale or the lock", async () => {
    const dir = await project({ a: "A" }, { de: undefined });
    const config = cfg({ targetLocales: ["de"] });
    const out = await exportWorkbook({ config, cwd: dir });
    await fillWorkbook(out.path, "de", { a: "Aa" });

    const summary = await importWorkbook({ config, workbook: out.path, cwd: dir, dryRun: true });
    expect(summary.dryRun).toBe(true);
    expect(summary.locales[0]?.translated).toEqual(["a"]);
    await expect(readJsonFile(join(dir, "locales", "de.json"))).rejects.toThrow();
    await expect(readJsonFile(join(dir, "verbatra.lock.json"))).rejects.toThrow();
  });

  it("fails the locale for a sheet whose locale is not in the config", async () => {
    const dir = await project({ a: "A" }, { de: undefined });
    const exportConfig = cfg({ targetLocales: ["de", "es"] });
    const out = await exportWorkbook({ config: exportConfig, cwd: dir });
    await fillWorkbook(out.path, "es", { a: "Ae" });

    const summary = await importWorkbook({
      config: cfg({ targetLocales: ["de"] }),
      workbook: out.path,
      cwd: dir,
    });
    const es = summary.locales.find((l) => l.locale === "es");
    expect(es?.status).toBe("failed");
    expect(es?.error?.code).toBe("CONFIG_INVALID");
  });

  it("fails the locale for an unknown key that maps to no source or target", async () => {
    const dir = await project({ a: "A" }, { de: undefined });
    const config = cfg({ targetLocales: ["de"] });
    const out = await exportWorkbook({ config, cwd: dir });
    const data = await readWorkbook(new Uint8Array(await readFile(out.path)));
    const sheets = data.sheets.map((sheet) =>
      sheet.locale !== "de"
        ? sheet
        : {
            locale: sheet.locale,
            rows: [
              ...sheet.rows.map((r) => ({ ...r, translation: "Aa" })),
              {
                key: "ghost",
                source: "",
                currentTarget: "",
                status: "new" as const,
                sourceHash: "x",
                translation: "Boo",
                context: "",
                reviewStatus: "ok" as const,
                reviewReasons: "",
              },
            ],
          },
    );
    await writeFile(out.path, await buildWorkbook({ sheets }));

    const summary = await importWorkbook({ config, workbook: out.path, cwd: dir });
    expect(summary.locales[0]?.status).toBe("failed");
    expect(summary.locales[0]?.error?.code).toBe("LOCALE_FAILED");
  });

  it("reports a missing workbook as a structured SOURCE_UNREADABLE", async () => {
    const dir = await project({ a: "A" }, { de: undefined });
    await expect(
      importWorkbook({
        config: cfg({ targetLocales: ["de"] }),
        workbook: join(dir, "absent.xlsx"),
        cwd: dir,
      }),
    ).rejects.toMatchObject({ code: "SOURCE_UNREADABLE" });
  });

  it("rejects a structurally invalid workbook as a structured SOURCE_INVALID", async () => {
    const dir = await project({ a: "A" }, { de: undefined });
    const path = join(dir, "bad.xlsx");
    await writeFile(path, new Uint8Array([1, 2, 3]));
    await expect(
      importWorkbook({ config: cfg({ targetLocales: ["de"] }), workbook: path, cwd: dir }),
    ).rejects.toMatchObject({ code: "SOURCE_INVALID" });
  });

  it("rejects an over-cap workbook (on-disk gate) as a structured SOURCE_INVALID", async () => {
    const dir = await project({ a: "A" }, { de: undefined });
    const fs = makeFakeFs({
      fileExists: async () => true,
      readBytesBounded: async () => ({ kind: "too-large" }),
    });
    await expect(
      importWorkbook(
        { config: cfg({ targetLocales: ["de"] }), workbook: join(dir, "wb.xlsx"), cwd: dir },
        { fs },
      ),
    ).rejects.toMatchObject({ code: "SOURCE_INVALID" });
  });

  it("reports a changed row the translator left blank as unfilled", async () => {
    const dir = await project({ greeting: "Hi there" }, { de: { greeting: "Hallo" } });
    const config = cfg({ targetLocales: ["de"] });
    await writeJsonFile(join(dir, "verbatra.lock.json"), {
      version: 1,
      locales: { de: { greeting: contentHash(entry("Hello")) } },
    });
    const out = await exportWorkbook({ config, cwd: dir });

    const summary = await importWorkbook({ config, workbook: out.path, cwd: dir });
    expect(summary.locales[0]?.unfilled).toEqual(["greeting"]);
    expect(summary.locales[0]?.translated).toEqual([]);
  });

  it("treats a whitespace-only translation cell as empty: not written", async () => {
    const dir = await project({ a: "A", b: "B" }, { de: undefined });
    const config = cfg({ targetLocales: ["de"] });
    const out = await exportWorkbook({ config, cwd: dir });
    await fillWorkbook(out.path, "de", { a: "Aa", b: "   " });

    const summary = await importWorkbook({ config, workbook: out.path, cwd: dir });
    expect(summary.locales[0]?.translated).toEqual(["a"]);
    const de = (await readJsonFile(join(dir, "locales", "de.json"))) as Record<string, string>;
    expect(de.b).toBeUndefined();
  });

  it("imports a sheet's good rows and reports a malformed row by row and column", async () => {
    const dir = await project({ good: "A", bad: "B" }, { de: undefined });
    const config = cfg({ targetLocales: ["de"] });
    const out = await exportWorkbook({ config, cwd: dir });
    const data = await readWorkbook(new Uint8Array(await readFile(out.path)));
    const sheets = data.sheets.map((sheet) => ({
      locale: sheet.locale,
      rows: sheet.rows.map((r) =>
        r.key === "good"
          ? { ...r, translation: "Gut" }
          : { ...r, translation: "Schlecht", status: "weird" as RowStatus },
      ),
    }));
    await writeFile(out.path, await buildWorkbook({ sheets }));

    const summary = await importWorkbook({ config, workbook: out.path, cwd: dir });
    expect(summary.locales[0]?.translated).toEqual(["good"]);
    expect(summary.locales[0]?.malformedRows).toHaveLength(1);
    expect(summary.locales[0]?.malformedRows[0]?.column).toBe("Status");
    expect(summary.locales[0]?.malformedRows[0]).not.toHaveProperty("line");
    const de = (await readJsonFile(join(dir, "locales", "de.json"))) as Record<string, string>;
    expect(de.good).toBe("Gut");
    expect(de.bad).toBeUndefined();
  });

  it("reports a duplicate key as a conflict and keeps the first occurrence", async () => {
    const dir = await project({ a: "A" }, { de: undefined });
    const config = cfg({ targetLocales: ["de"] });
    const out = await exportWorkbook({ config, cwd: dir });
    const data = await readWorkbook(new Uint8Array(await readFile(out.path)));
    const sheets = data.sheets.map((sheet) => ({
      locale: sheet.locale,
      rows: [
        ...sheet.rows.map((r) => ({ ...r, translation: "First" })),
        ...sheet.rows.map((r) => ({ ...r, translation: "Second" })),
      ],
    }));
    await writeFile(out.path, await buildWorkbook({ sheets }));

    const summary = await importWorkbook({ config, workbook: out.path, cwd: dir });
    expect(summary.locales[0]?.duplicateKeys).toHaveLength(1);
    expect(summary.locales[0]?.duplicateKeys[0]?.key).toBe("a");
    const de = (await readJsonFile(join(dir, "locales", "de.json"))) as Record<string, string>;
    expect(de.a).toBe("First");
  });

  it("reports a deleted locale tab as a WORKBOOK_SHEET_MISSING failure, not a silent drop", async () => {
    const dir = await project({ a: "A" }, { de: undefined, fr: undefined });
    const config = cfg({ targetLocales: ["de", "fr"] });
    const out = await exportWorkbook({ config, cwd: dir });
    const data = await readWorkbook(new Uint8Array(await readFile(out.path)));
    const deOnly = data.sheets.filter((sheet) => sheet.locale === "de");
    await writeFile(out.path, await buildWorkbook({ sheets: deOnly }));

    const summary = await importWorkbook({ config, workbook: out.path, cwd: dir });
    const fr = summary.locales.find((l) => l.locale === "fr");
    expect(fr?.status).toBe("failed");
    expect(fr?.error?.code).toBe("WORKBOOK_SHEET_MISSING");
    expect(summary.failed).toContain("fr");
  });

  it("orders locales by the handoff, appending the locales it had nothing for", async () => {
    const dir = await project({ a: "A" }, { de: undefined, fr: undefined });
    const config = cfg({ targetLocales: ["de", "fr"] });
    const out = await exportWorkbook({ config, cwd: dir });
    const data = await readWorkbook(new Uint8Array(await readFile(out.path)));
    const frOnly = data.sheets.filter((sheet) => sheet.locale === "fr");
    await writeFile(out.path, await buildWorkbook({ sheets: frOnly }));

    const summary = await importWorkbook({ config, workbook: out.path, cwd: dir });

    expect(summary.locales.map((l) => l.locale)).toEqual(["fr", "de"]);
  });

  it("reports a renamed tab as an unexpected sheet and its original locale as missing", async () => {
    const dir = await project({ a: "A" }, { de: undefined });
    const out = await exportWorkbook({ config: cfg({ targetLocales: ["de"] }), cwd: dir });
    const data = await readWorkbook(new Uint8Array(await readFile(out.path)));
    const renamed = data.sheets.map((sheet) => ({ locale: "german", rows: sheet.rows }));
    await writeFile(out.path, await buildWorkbook({ sheets: renamed }));

    const summary = await importWorkbook({
      config: cfg({ targetLocales: ["de"] }),
      workbook: out.path,
      cwd: dir,
    });
    const german = summary.locales.find((l) => l.locale === "german");
    const de = summary.locales.find((l) => l.locale === "de");
    expect(german?.error?.code).toBe("CONFIG_INVALID");
    expect(de?.error?.code).toBe("WORKBOOK_SHEET_MISSING");
  });

  it("clears a value via [[CLEAR]]: written empty, key kept, lock baseline advanced", async () => {
    const dir = await project({ a: "A" }, { de: { a: "Aa" } });
    const config = cfg({ targetLocales: ["de"] });
    const out = await exportWorkbook({ config, cwd: dir, includeUnchanged: true });
    await fillWorkbook(out.path, "de", { a: "[[CLEAR]]" });

    const summary = await importWorkbook({ config, workbook: out.path, cwd: dir });
    expect(summary.locales[0]?.translated).toEqual(["a"]);
    const de = (await readJsonFile(join(dir, "locales", "de.json"))) as Record<string, string>;
    expect(de.a).toBe("");
    const lock = (await readJsonFile(join(dir, "verbatra.lock.json"))) as {
      locales: Record<string, Record<string, string>>;
    };
    expect(lock.locales.de?.a).toBe(contentHash(entry("A")));
  });

  it("round-trips a key with leading and trailing whitespace through export and import", async () => {
    const dir = await project({ " spaced key ": "Hello" }, { de: undefined });
    const config = cfg({ targetLocales: ["de"] });
    const out = await exportWorkbook({ config, cwd: dir });
    await fillWorkbook(out.path, "de", { " spaced key ": "Hallo" });

    const summary = await importWorkbook({ config, workbook: out.path, cwd: dir });
    expect(summary.locales[0]?.error).toBeUndefined();
    expect(summary.locales[0]?.status).not.toBe("failed");
    expect(summary.locales[0]?.translated).toEqual([" spaced key "]);
    const de = (await readJsonFile(join(dir, "locales", "de.json"))) as Record<string, string>;
    expect(de[" spaced key "]).toBe("Hallo");
  });

  it("reads and imports the exact exported, structure-locked bytes with no intermediate re-save", async () => {
    const dir = await project({ a: "A", b: "B" }, { de: { a: "Aa" } });
    const config = cfg({ targetLocales: ["de"] });
    const out = await exportWorkbook({ config, cwd: dir, includeUnchanged: true });

    const readBack = await readWorkbook(new Uint8Array(await readFile(out.path)));
    expect(readBack.sheets[0]?.rows.map((r) => r.key).sort()).toEqual(["a", "b"]);

    const direct = await importWorkbook({ config, workbook: out.path, cwd: dir });
    expect(direct.locales[0]?.error).toBeUndefined();
    expect(direct.locales[0]?.status).toBe("succeeded");

    await fillWorkbook(out.path, "de", { b: "Bb" });
    const filled = await importWorkbook({ config, workbook: out.path, cwd: dir });
    expect(filled.locales[0]?.translated).toContain("b");
    const de = (await readJsonFile(join(dir, "locales", "de.json"))) as Record<string, string>;
    expect(de.b).toBe("Bb");
  });

  it("aborts the whole run when the lock file turns corrupt mid-run, sparing the later locales", async () => {
    const dir = await project(
      { greeting: "Hello" },
      { de: { stale: "Veraltet" }, fr: { stale: "Perime" }, es: { stale: "Obsoleto" } },
    );
    const config = cfg({ targetLocales: ["de", "fr", "es"] });
    const out = await exportWorkbook({ config, cwd: dir });
    await fillWorkbook(out.path, "de", { greeting: "Hallo" });
    await fillWorkbook(out.path, "fr", { greeting: "Salut" });
    await fillWorkbook(out.path, "es", { greeting: "Hola" });

    const before = await readLocaleFiles(dir, ["de", "fr", "es"]);
    const { fs } = lockCorruptingFs(lockFilePath(dir));

    const thrown = await importWorkbook({ config, workbook: out.path, cwd: dir }, { fs }).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(thrown).toBeInstanceOf(SdkError);
    expect((thrown as SdkError).code).toBe("LOCK_FILE_INVALID");

    const after = await readLocaleFiles(dir, ["de", "fr", "es"]);
    expect(after.de).not.toBe(before.de);
    expect(after.fr).toBe(before.fr);
    expect(after.es).toBe(before.es);
  });

  it("keeps importing the later sheets after a per-locale failure that is not lock corruption", async () => {
    const dir = await project({ greeting: "Hello" }, { de: undefined, es: undefined });
    const out = await exportWorkbook({ config: cfg({ targetLocales: ["es", "de"] }), cwd: dir });
    await fillWorkbook(out.path, "es", { greeting: "Hola" });
    await fillWorkbook(out.path, "de", { greeting: "Hallo" });

    const summary = await importWorkbook({
      config: cfg({ targetLocales: ["de"] }),
      workbook: out.path,
      cwd: dir,
    });
    const es = summary.locales.find((l) => l.locale === "es");
    expect(es?.status).toBe("failed");
    expect(es?.error?.code).toBe("CONFIG_INVALID");
    expect(summary.succeeded).toEqual(["de"]);
    const de = (await readJsonFile(join(dir, "locales", "de.json"))) as Record<string, string>;
    expect(de.greeting).toBe("Hallo");
  });

  it("dry-run reports every locale and writes no lock file even when a later read would fail", async () => {
    const dir = await project({ greeting: "Hello" }, { de: undefined, fr: undefined });
    const config = cfg({ targetLocales: ["de", "fr"] });
    const out = await exportWorkbook({ config, cwd: dir });
    await fillWorkbook(out.path, "de", { greeting: "Hallo" });
    await fillWorkbook(out.path, "fr", { greeting: "Salut" });
    const { fs, lockWrites } = lockCorruptingFs(lockFilePath(dir));

    const summary = await importWorkbook(
      { config, workbook: out.path, cwd: dir, dryRun: true },
      { fs },
    );
    expect(summary.dryRun).toBe(true);
    expect(summary.locales.map((l) => l.translated)).toEqual([["greeting"], ["greeting"]]);
    expect(lockWrites).toEqual([]);
    await expect(readJsonFile(join(dir, "locales", "de.json"))).rejects.toThrow();
  });

  it("withholds a [[CLEAR]] whose source drifted since export, like any drift", async () => {
    const dir = await project({ a: "A" }, { de: { a: "Aa" } });
    const config = cfg({ targetLocales: ["de"] });
    const out = await exportWorkbook({ config, cwd: dir, includeUnchanged: true });
    await fillWorkbook(out.path, "de", { a: "[[CLEAR]]" });
    await writeJsonFile(join(dir, "locales", "en.json"), { a: "A changed" });

    const summary = await importWorkbook({ config, workbook: out.path, cwd: dir });
    expect(summary.locales[0]?.integrityMismatches).toEqual(["a"]);
    expect(summary.locales[0]?.translated).toEqual([]);
    const de = (await readJsonFile(join(dir, "locales", "de.json"))) as Record<string, string>;
    expect(de.a).toBe("Aa");
  });
});
