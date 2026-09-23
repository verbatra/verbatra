import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildWorkbook, readWorkbook } from "@verbatra/exchange";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import { check } from "../flow/check.js";
import { diff } from "../flow/diff.js";
import { editEntry } from "../flow/edit-entry.js";
import { keyValue } from "../flow/key-value.js";
import { localeValues } from "../flow/locale-values.js";
import { lockState } from "../flow/lock-state.js";
import { retranslateEntry } from "../flow/retranslate-entry.js";
import { translate } from "../flow/translate-project.js";
import { exportWorkbook } from "../flow/workbook/export-workbook.js";
import { importWorkbook } from "../flow/workbook/import-workbook.js";
import { type BoundedFileRead, defaultFs, type SdkFs } from "../fs.js";
import {
  baseConfig,
  makeStubProvider,
  makeTempDir,
  readTextFile,
  writeJsonFile,
} from "../test-support.js";
import { loadProvenance } from "./load-provenance.js";
import {
  MAX_PROVENANCE_FILE_BYTES,
  PROVENANCE_FILE_NAME,
  type ProvenanceRecord,
} from "./provenance-file.js";

const cfg = (overrides: Partial<VerbatraConfig> = {}): VerbatraConfig =>
  baseConfig({ targetLocales: ["de"], ...overrides });

async function project(
  source: Record<string, unknown>,
  target?: Record<string, unknown>,
): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), source);
  if (target !== undefined) {
    await writeJsonFile(join(dir, "locales", "de.json"), target);
  }
  return dir;
}

async function recordsFor(dir: string): Promise<Record<string, ProvenanceRecord>> {
  return { ...(await loadProvenance({ cwd: dir })).locales.de };
}

async function markReview(dir: string, key: string, reviewState: string): Promise<void> {
  const path = join(dir, PROVENANCE_FILE_NAME);
  const file = JSON.parse(await readTextFile(path)) as {
    locales: Record<string, Record<string, Record<string, string>>>;
  };
  const record = file.locales.de?.[key];
  if (record === undefined) {
    throw new Error(`no record for ${key}`);
  }
  record.reviewState = reviewState;
  await writeFile(path, JSON.stringify(file), "utf8");
}

async function fillWorkbook(path: string, fills: Readonly<Record<string, string>>): Promise<void> {
  const data = await readWorkbook(new Uint8Array(await readFile(path)));
  const sheets = data.sheets.map((sheet) => ({
    locale: sheet.locale,
    rows: sheet.rows.map((row) =>
      fills[row.key] !== undefined ? { ...row, translation: fills[row.key] as string } : row,
    ),
  }));
  await writeFile(path, await buildWorkbook({ sheets }));
}

async function importFilled(dir: string, fills: Readonly<Record<string, string>>): Promise<void> {
  const out = await exportWorkbook({ config: cfg(), cwd: dir });
  await fillWorkbook(out.path, fills);
  await importWorkbook({ config: cfg(), workbook: out.path, cwd: dir });
}

const stubCreate = () => makeStubProvider().provider;

describe("provenance lifecycle: review decisions and records across later writes", () => {
  it("an approved record survives a re-import of the same row and resets when the source changes", async () => {
    const dir = await project({ greeting: "Hello" });
    await importFilled(dir, { greeting: "Hallo" });
    await markReview(dir, "greeting", "approved");

    await importFilled(dir, { greeting: "Hallo" });
    expect((await recordsFor(dir)).greeting?.reviewState).toBe("approved");

    await writeJsonFile(join(dir, "locales", "en.json"), { greeting: "Hello there" });
    await importFilled(dir, { greeting: "Hallo" });
    expect((await recordsFor(dir)).greeting).toEqual({
      origin: "import",
      valueHash: expect.any(String),
    });
  });

  it("a key withheld by a failed provider call keeps its record, review decision included", async () => {
    const dir = await project({ greeting: "Hello", farewell: "Bye" });
    await editEntry({ config: cfg(), cwd: dir, locale: "de", key: "greeting", value: "Hallo" });
    await markReview(dir, "greeting", "approved");
    const before = (await recordsFor(dir)).greeting;
    await writeJsonFile(join(dir, "locales", "en.json"), {
      greeting: "Hello there",
      farewell: "Bye",
    });

    const summary = await translate(
      { config: cfg(), cwd: dir },
      { createProvider: () => makeStubProvider({ missingValues: new Set(["greeting"]) }).provider },
    );

    expect(summary.locales[0]?.providerFailures).toEqual(["greeting"]);
    expect((await recordsFor(dir)).greeting).toEqual(before);
    expect((await recordsFor(dir)).farewell?.origin).toBe("machine");
  });

  it("a key removed from the source keeps its record until pruned, and a rejected record survives the prune", async () => {
    const dir = await project({ greeting: "Hello", farewell: "Bye", title: "Title" });
    await translate({ config: cfg(), cwd: dir }, { createProvider: stubCreate });
    await markReview(dir, "title", "rejected");
    await writeJsonFile(join(dir, "locales", "en.json"), { greeting: "Hello" });

    await translate({ config: cfg(), cwd: dir }, { createProvider: stubCreate });
    expect(Object.keys(await recordsFor(dir)).sort()).toEqual(["farewell", "greeting", "title"]);

    await translate({ config: cfg(), cwd: dir, prune: true }, { createProvider: stubCreate });
    const records = await recordsFor(dir);
    expect(Object.keys(records).sort()).toEqual(["greeting", "title"]);
    expect(records.title?.reviewState).toBe("rejected");
  });
});

describe("provenance: single-key writers check the file before anything else", () => {
  it("editEntry refuses a corrupt provenance file and leaves the target untouched", async () => {
    const dir = await project({ greeting: "Hello" }, { greeting: "Hallo" });
    await writeFile(join(dir, PROVENANCE_FILE_NAME), "{ nope", "utf8");
    const before = await readTextFile(join(dir, "locales", "de.json"));

    await expect(
      editEntry({ config: cfg(), cwd: dir, locale: "de", key: "greeting", value: "Servus" }),
    ).rejects.toMatchObject({ code: "PROVENANCE_FILE_INVALID" });
    expect(await readTextFile(join(dir, "locales", "de.json"))).toBe(before);
  });

  it("retranslateEntry refuses a corrupt provenance file before calling the provider", async () => {
    const dir = await project({ greeting: "Hello" }, { greeting: "Hallo" });
    await writeFile(join(dir, PROVENANCE_FILE_NAME), "[]", "utf8");
    const before = await readTextFile(join(dir, "locales", "de.json"));
    const stub = makeStubProvider();

    await expect(
      retranslateEntry(
        { config: cfg(), cwd: dir, locale: "de", key: "greeting" },
        { createProvider: () => stub.provider },
      ),
    ).rejects.toMatchObject({ code: "PROVENANCE_FILE_INVALID" });
    expect(stub.calls).toHaveLength(0);
    expect(await readTextFile(join(dir, "locales", "de.json"))).toBe(before);
  });

  it("a file from a newer verbatra is left untouched while the single-key edit still writes", async () => {
    const dir = await project({ greeting: "Hello" }, { greeting: "Hallo" });
    const newer = '{"version":9,"locales":{}}';
    await writeFile(join(dir, PROVENANCE_FILE_NAME), newer, "utf8");

    const edited = await editEntry({
      config: cfg(),
      cwd: dir,
      locale: "de",
      key: "greeting",
      value: "Servus",
    });
    const retranslated = await retranslateEntry(
      { config: cfg(), cwd: dir, locale: "de", key: "greeting" },
      { createProvider: stubCreate },
    );

    expect(edited.accepted && retranslated.accepted).toBe(true);
    expect(await readTextFile(join(dir, PROVENANCE_FILE_NAME))).toBe(newer);
  });
});

describe("provenance: reports never fail over the provenance file", () => {
  it.each([
    ["corrupt", "{ nope"],
    ["from a newer verbatra", '{"version":9,"locales":{}}'],
  ])("a %s file leaves the provenance fields out", async (_label, content) => {
    const dir = await project({ greeting: "Hello", farewell: "Bye" });
    await translate({ config: cfg(), cwd: dir }, { createProvider: stubCreate });
    await writeJsonFile(join(dir, "locales", "en.json"), {
      greeting: "Hello there",
      farewell: "Bye",
    });
    await writeFile(join(dir, PROVENANCE_FILE_NAME), content, "utf8");

    const checked = await check({ config: cfg(), cwd: dir });
    const diffed = await diff({ config: cfg(), cwd: dir });
    const state = await lockState({ config: cfg(), cwd: dir });
    const value = await keyValue({ config: cfg(), cwd: dir, locale: "de", key: "greeting" });
    const values = await localeValues({ config: cfg(), cwd: dir });

    expect(checked.locales[0]).not.toHaveProperty("provenance");
    expect(diffed.locales[0]?.changed).toEqual(["greeting"]);
    expect(diffed.locales[0]).not.toHaveProperty("changedOrigins");
    expect(state.exists && state.locales[0]).not.toHaveProperty("provenance");
    expect(value).not.toHaveProperty("provenance");
    expect(values[0]?.values.greeting).not.toHaveProperty("provenance");
  });
});

describe("provenance: the file never grows past what verbatra reads back", () => {
  it("keeps the previous file and reports a notice when a write would exceed the read limit", async () => {
    const dir = await project({ greeting: "Hello" });
    const padding = "x".repeat(MAX_PROVENANCE_FILE_BYTES - 200);
    const existing = `${JSON.stringify({
      version: 1,
      locales: { fr: { pad: { origin: "human", valueHash: "h", padding } } },
    })}\n`;
    await writeFile(join(dir, PROVENANCE_FILE_NAME), existing, "utf8");

    const summary = await translate({ config: cfg(), cwd: dir }, { createProvider: stubCreate });

    expect(summary.locales[0]?.translated).toEqual(["greeting"]);
    expect(summary.locales[0]?.notices.map((notice) => notice.code)).toContain(
      "PROVENANCE_FILE_TOO_LARGE",
    );
    expect(await readTextFile(join(dir, PROVENANCE_FILE_NAME))).toBe(existing);
  });

  it("importWorkbook reports the same notice", async () => {
    const dir = await project({ greeting: "Hello" });
    const padding = "x".repeat(MAX_PROVENANCE_FILE_BYTES - 200);
    await writeFile(
      join(dir, PROVENANCE_FILE_NAME),
      JSON.stringify({
        version: 1,
        locales: { fr: { pad: { origin: "human", valueHash: "h", padding } } },
      }),
      "utf8",
    );
    const out = await exportWorkbook({ config: cfg(), cwd: dir });
    await fillWorkbook(out.path, { greeting: "Hallo" });

    const before = await readTextFile(join(dir, PROVENANCE_FILE_NAME));

    const summary = await importWorkbook({ config: cfg(), workbook: out.path, cwd: dir });

    expect(summary.locales[0]?.notices.map((notice) => notice.code)).toContain(
      "PROVENANCE_FILE_TOO_LARGE",
    );
    expect(await readTextFile(join(dir, PROVENANCE_FILE_NAME))).toBe(before);
  });

  it("still advances the lock when a source change is translated while the file is too large", async () => {
    const dir = await project({ greeting: "Hello" });
    await translate({ config: cfg(), cwd: dir }, { createProvider: stubCreate });
    const lockBefore = await readTextFile(join(dir, "verbatra.lock.json"));
    const padding = "x".repeat(MAX_PROVENANCE_FILE_BYTES - 200);
    const oversized = `${JSON.stringify({
      version: 1,
      locales: { fr: { pad: { origin: "human", valueHash: "h", padding } } },
    })}\n`;
    await writeFile(join(dir, PROVENANCE_FILE_NAME), oversized, "utf8");
    await writeJsonFile(join(dir, "locales", "en.json"), { greeting: "Hello there" });

    const stub = makeStubProvider();
    await translate({ config: cfg(), cwd: dir }, { createProvider: () => stub.provider });
    const again = await translate(
      { config: cfg(), cwd: dir },
      { createProvider: () => stub.provider },
    );

    expect(await readTextFile(join(dir, "verbatra.lock.json"))).not.toBe(lockBefore);
    expect(await readTextFile(join(dir, PROVENANCE_FILE_NAME))).toBe(oversized);
    expect(again.locales[0]?.translated).toEqual([]);
    expect(stub.calls).toHaveLength(1);
  });
});

describe("provenance: a file that turns corrupt during a run", () => {
  it("aborts importWorkbook as a whole run instead of failing only the locale being recorded", async () => {
    const dir = await project({ greeting: "Hello" });
    const config = cfg({ targetLocales: ["de", "fr"] });
    const out = await exportWorkbook({ config, cwd: dir });
    await fillWorkbook(out.path, { greeting: "Hallo" });
    let provenanceReads = 0;
    const fs: SdkFs = {
      ...defaultFs,
      readFileBounded: async (path: string, maxBytes: number): Promise<BoundedFileRead> => {
        if (!path.endsWith(PROVENANCE_FILE_NAME)) {
          return defaultFs.readFileBounded(path, maxBytes);
        }
        provenanceReads += 1;
        return provenanceReads === 1 ? { kind: "missing" } : { kind: "ok", content: "[]" };
      },
    };

    await expect(
      importWorkbook({ config, workbook: out.path, cwd: dir }, { fs }),
    ).rejects.toMatchObject({ code: "PROVENANCE_FILE_INVALID" });
    expect(provenanceReads).toBe(2);
  });
});
