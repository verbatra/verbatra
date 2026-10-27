import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildWorkbook, readWorkbook } from "@verbatra/exchange";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import type { KeyProvenance } from "../lock/key-provenance.js";
import type { CreateProvider } from "../selection/select-provider.js";
import {
  baseConfig,
  makeStubProvider,
  makeTempDir,
  readJsonFile,
  writeJsonFile,
} from "../test-support.js";
import { check } from "./check.js";
import { editEntry } from "./edit-entry.js";
import { keyValue } from "./key-value.js";
import { retranslateEntry } from "./retranslate-entry.js";
import { approveEntry } from "./review-decision.js";
import { reviewQueue } from "./review-queue.js";
import { translate } from "./translate-project.js";
import { exportWorkbook } from "./workbook/export-workbook.js";
import { importWorkbook } from "./workbook/import-workbook.js";

const cfg = (overrides: Partial<VerbatraConfig> = {}): VerbatraConfig =>
  baseConfig({ targetLocales: ["de"], humanEdits: "overwrite", ...overrides });

const stubCreate: CreateProvider = (config) => makeStubProvider({ id: config.id }).provider;

async function approvedProject(): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), { greeting: "Hello" });
  await translate({ config: cfg(), cwd: dir }, { createProvider: stubCreate });
  const values = (await readJsonFile(join(dir, "locales", "de.json"))) as Record<string, string>;
  await approveEntry({
    config: cfg(),
    cwd: dir,
    locale: "de",
    key: "greeting",
    expectedValue: values.greeting ?? "",
  });
  return dir;
}

async function provenanceOf(dir: string): Promise<KeyProvenance | undefined> {
  return (await keyValue({ config: cfg(), cwd: dir, locale: "de", key: "greeting" })).provenance;
}

async function isQueued(dir: string): Promise<boolean> {
  const queue = await reviewQueue({ config: cfg(), cwd: dir });
  return queue.available && queue.locales.some((l) => l.needsReview.length > 0);
}

async function gateUnreviewed(dir: string): Promise<number | undefined> {
  return (await check({ config: cfg(), cwd: dir, requireReviewed: true })).review?.unreviewed;
}

describe("an approved value drops back to unreviewed on every write that changes it", () => {
  it("starts approved, out of the queue, and passes the gate", async () => {
    const dir = await approvedProject();

    expect((await provenanceOf(dir))?.reviewState).toBe("approved");
    expect(await isQueued(dir)).toBe(false);
    expect(await gateUnreviewed(dir)).toBe(0);
  });

  it("editEntry by a person: unreviewed human value, which needs no approval", async () => {
    const dir = await approvedProject();

    await editEntry({ config: cfg(), cwd: dir, locale: "de", key: "greeting", value: "Hallo" });

    expect(await provenanceOf(dir)).toEqual({ origin: "human", reviewState: "unreviewed" });
    expect(await isQueued(dir)).toBe(false);
    expect(await gateUnreviewed(dir)).toBe(0);
  });

  it("editEntry by an agent: unreviewed agent value, back in the queue and failing the gate", async () => {
    const dir = await approvedProject();

    await editEntry({
      config: cfg(),
      cwd: dir,
      locale: "de",
      key: "greeting",
      value: "Hallo",
      actor: "agent",
    });

    expect(await provenanceOf(dir)).toEqual({ origin: "agent", reviewState: "unreviewed" });
    expect(await isQueued(dir)).toBe(true);
    expect(await gateUnreviewed(dir)).toBe(1);
  });

  it("retranslateEntry: a new machine value, back in the queue", async () => {
    const dir = await approvedProject();

    await retranslateEntry(
      { config: cfg(), cwd: dir, locale: "de", key: "greeting" },
      {
        createProvider: (config) =>
          makeStubProvider({ id: config.id, translate: () => "Guten Tag" }).provider,
      },
    );

    expect(await provenanceOf(dir)).toMatchObject({ origin: "machine", reviewState: "unreviewed" });
    expect(await isQueued(dir)).toBe(true);
    expect(await gateUnreviewed(dir)).toBe(1);
  });

  it("translate after a source change: a new machine value, back in the queue", async () => {
    const dir = await approvedProject();
    await writeJsonFile(join(dir, "locales", "en.json"), { greeting: "Hello there" });

    await translate({ config: cfg(), cwd: dir }, { createProvider: stubCreate });

    expect(await provenanceOf(dir)).toMatchObject({ origin: "machine", reviewState: "unreviewed" });
    expect(await isQueued(dir)).toBe(true);
  });

  it("importWorkbook with a changed row: an unreviewed import value", async () => {
    const dir = await approvedProject();
    const out = await exportWorkbook({ config: cfg(), cwd: dir, includeUnchanged: true });
    const data = await readWorkbook(new Uint8Array(await readFile(out.path)));
    await writeFile(
      out.path,
      await buildWorkbook({
        sheets: data.sheets.map((sheet) => ({
          locale: sheet.locale,
          rows: sheet.rows.map((row) => ({ ...row, translation: "Hallo" })),
        })),
      }),
    );

    await importWorkbook({ config: cfg(), workbook: out.path, cwd: dir });

    expect(await provenanceOf(dir)).toEqual({ origin: "import", reviewState: "unreviewed" });
    expect(await isQueued(dir)).toBe(false);
  });

  it("a hand edit of the locale file: detected by the value hash, read as an unreviewed external value", async () => {
    const dir = await approvedProject();

    await writeJsonFile(join(dir, "locales", "de.json"), { greeting: "Moin" });

    expect(await provenanceOf(dir)).toEqual({ origin: "external", reviewState: "unreviewed" });
    expect(await isQueued(dir)).toBe(false);
    expect(await gateUnreviewed(dir)).toBe(0);
  });

  it("a write that leaves the value as it was keeps the approval", async () => {
    const dir = await approvedProject();
    const values = (await readJsonFile(join(dir, "locales", "de.json"))) as Record<string, string>;

    await editEntry({
      config: cfg(),
      cwd: dir,
      locale: "de",
      key: "greeting",
      value: values.greeting ?? "",
      actor: "agent",
    });

    expect((await provenanceOf(dir))?.reviewState).toBe("approved");
  });
});
