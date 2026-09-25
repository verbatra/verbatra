import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import { runStatusFilePath } from "../run-status/run-status-file.js";
import {
  baseConfig,
  makeStubProvider,
  makeTempDir,
  readJsonFile,
  writeJsonFile,
} from "../test-support.js";
import { editEntry } from "./edit-entry.js";
import { keyIntegrity } from "./key-integrity.js";
import { keyValue } from "./key-value.js";
import { localeValues } from "./locale-values.js";
import { retranslateEntry } from "./retranslate-entry.js";
import { approveEntry } from "./review-decision.js";
import { reviewQueue } from "./review-queue.js";
import { exportTmx } from "./tmx/export-tmx.js";
import { importTmx } from "./tmx/import-tmx.js";
import { translate } from "./translate-project.js";
import { exportWorkbook } from "./workbook/export-workbook.js";
import { importWorkbook } from "./workbook/import-workbook.js";

const config: VerbatraConfig = baseConfig({ targetLocales: ["pt-BR"] });
const STATE_FILES = ["verbatra.lock.json", "verbatra.provenance.json", "verbatra.cache.json"];
const createProvider = () => makeStubProvider().provider;

async function respell(dir: string): Promise<void> {
  for (const name of STATE_FILES) {
    const path = join(dir, name);
    const content = await readFile(path, "utf8").catch(() => undefined);
    if (content !== undefined) {
      await writeFile(path, content.replaceAll('"pt-BR"', '"pt_BR"'), "utf8");
    }
  }
}

async function respelledProject(prepare?: (dir: string) => Promise<void>): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), { a: "A old", b: "B" });
  await translate({ config, cwd: dir }, { createProvider });
  await prepare?.(dir);
  await writeJsonFile(join(dir, "locales", "en.json"), { a: "A new", b: "B" });
  await respell(dir);
  return dir;
}

async function stateLocales(dir: string, name: string): Promise<readonly string[]> {
  const file = (await readJsonFile(join(dir, name))) as {
    locales?: Record<string, unknown>;
    entries?: Record<string, Record<string, unknown>>;
  };
  if (file.entries !== undefined) {
    return [...new Set(Object.values(file.entries).flatMap((byLocale) => Object.keys(byLocale)))];
  }
  return Object.keys(file.locales ?? {});
}

describe("read-only flows: state recorded under a respelled locale", () => {
  it("keyIntegrity judges the key stale against the carried baseline", async () => {
    const dir = await respelledProject();

    const [locale] = await keyIntegrity({ config, cwd: dir, locales: ["pt-BR"] });

    expect(locale?.entries.map((entry) => entry.key)).toEqual(["a"]);
  });

  it("keyValue and localeValues report the carried provenance", async () => {
    const dir = await respelledProject();

    const value = await keyValue({ config, cwd: dir, locale: "pt-BR", key: "b" });
    const [values] = await localeValues({ config, cwd: dir, locales: ["pt-BR"] });

    expect(value.provenance?.origin).toBe("machine");
    expect(values?.values.b?.provenance?.origin).toBe("machine");
  });

  it("reviewQueue drops a flag the carried provenance records as approved", async () => {
    const dir = await respelledProject(async (project) => {
      await approveEntry({
        config,
        cwd: project,
        locale: "pt-BR",
        key: "b",
        expectedValue: "[pt-BR] B",
      });
    });
    await mkdir(join(dir, ".verbatra-local"), { recursive: true });
    await writeFile(
      runStatusFilePath(dir),
      JSON.stringify({
        version: 1,
        generatedAt: "2026-09-23T10:00:00.000Z",
        locales: [
          {
            locale: "pt-BR",
            status: "succeeded",
            needsReview: [{ key: "b", reasons: ["EQUALS_SOURCE"] }],
          },
        ],
      }),
      "utf8",
    );

    const queue = await reviewQueue({ config, cwd: dir });

    expect(queue.available && queue.locales[0]?.needsReview).toEqual([]);
  });

  it("exportWorkbook exports only the key stale against the carried baseline", async () => {
    const dir = await respelledProject();

    const result = await exportWorkbook({ config, cwd: dir, format: "csv", out: "handoff" });

    expect(result.locales).toEqual([{ locale: "pt-BR", rows: 1 }]);
  });

  it("exportTmx exports the translations remembered under the underscore spelling", async () => {
    const dir = await respelledProject();

    const result = await exportTmx({ config, cwd: dir });

    expect(result.locales).toEqual([{ locale: "pt-BR", units: 2 }]);
    expect(await stateLocales(dir, "verbatra.cache.json")).toEqual(["pt_BR"]);
  });
});

describe("write flows: state recorded under a respelled locale is moved first", () => {
  it("importTmx matches the TMX against the translations remembered under the old spelling", async () => {
    const dir = await respelledProject();
    const tmx = await exportTmx({ config, cwd: dir });

    const result = await importTmx({ config, cwd: dir, file: tmx.path });

    expect(result.locales).toMatchObject([{ locale: "pt-BR", added: 0, unchanged: 2 }]);
  });

  it("importWorkbook moves the state and reports the carry-over", async () => {
    const dir = await respelledProject();
    const out = await exportWorkbook({ config, cwd: dir, format: "csv", out: "handoff" });

    const summary = await importWorkbook({ config, cwd: dir, workbook: out.path, format: "csv" });

    expect(summary.locales[0]?.notices.map((notice) => notice.code)).toContain(
      "LOCALE_STATE_CARRIED_OVER",
    );
    expect(await stateLocales(dir, "verbatra.lock.json")).toEqual(["pt-BR"]);
    expect(await stateLocales(dir, "verbatra.provenance.json")).toEqual(["pt-BR"]);
  });

  it("an importWorkbook dry run reads the carried baseline and moves nothing", async () => {
    const dir = await respelledProject();
    const out = await exportWorkbook({ config, cwd: dir, format: "csv", out: "handoff" });

    const summary = await importWorkbook({
      config,
      cwd: dir,
      workbook: out.path,
      format: "csv",
      dryRun: true,
    });

    expect(summary.locales[0]?.status).toBe("succeeded");
    expect(await stateLocales(dir, "verbatra.lock.json")).toEqual(["pt_BR"]);
  });

  it("editEntry keeps the baseline of the other keys under the configured locale", async () => {
    const dir = await respelledProject();

    await editEntry({ config, cwd: dir, locale: "pt-BR", key: "b", value: "B edited" });

    const lock = (await readJsonFile(join(dir, "verbatra.lock.json"))) as {
      locales: Record<string, Record<string, string>>;
    };
    expect(Object.keys(lock.locales)).toEqual(["pt-BR"]);
    expect(Object.keys(lock.locales["pt-BR"] ?? {}).sort()).toEqual(["a", "b"]);
  });

  it("approveEntry approves a key that is up to date against the carried baseline", async () => {
    const dir = await respelledProject();

    const result = await approveEntry({
      config,
      cwd: dir,
      locale: "pt-BR",
      key: "b",
      expectedValue: "[pt-BR] B",
    });

    expect(result.provenance.reviewState).toBe("approved");
    expect(await stateLocales(dir, "verbatra.provenance.json")).toEqual(["pt-BR"]);
  });

  it("retranslateEntry records its result under the configured locale only", async () => {
    const dir = await respelledProject();

    await retranslateEntry({ config, cwd: dir, locale: "pt-BR", key: "a" }, { createProvider });

    expect(await stateLocales(dir, "verbatra.lock.json")).toEqual(["pt-BR"]);
    expect(await stateLocales(dir, "verbatra.provenance.json")).toEqual(["pt-BR"]);
  });
});
