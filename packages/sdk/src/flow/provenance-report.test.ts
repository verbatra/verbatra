import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import { SdkError } from "../errors.js";
import { LOCK_FILE_NAME } from "../lock/lock-file.js";
import { PROVENANCE_FILE_NAME, valueHash } from "../lock/provenance-file.js";
import {
  baseConfig,
  makeStubProvider,
  makeTempDir,
  readJsonFile,
  writeJsonFile,
} from "../test-support.js";
import { PROVENANCE_BUCKETS, provenanceReport } from "./provenance-report.js";
import { translate } from "./translate-project.js";

const cfg = (): VerbatraConfig => baseConfig({ targetLocales: ["de", "fr"] });

const SOURCE = {
  machine: "Machine",
  approved: "Approved",
  staleApproval: "Stale approval",
  rejected: "Rejected",
  human: "Human",
  imported: "Imported",
  external: "External",
  unrecorded: "Unrecorded",
  unknown: "Unknown",
  missing: "Missing",
};

const FIXED_NOW = new Date("2026-09-29T08:00:00.000Z");

type Locales = Record<string, Record<string, string>>;

async function translatedProject(): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), SOURCE);
  await translate(
    { config: cfg(), cwd: dir },
    { createProvider: () => makeStubProvider({ id: "deepl" }).provider },
  );
  return dir;
}

async function localeJson(dir: string, locale: string): Promise<Record<string, string>> {
  return (await readJsonFile(join(dir, "locales", `${locale}.json`))) as Record<string, string>;
}

async function rewriteGerman(dir: string): Promise<void> {
  const values = await localeJson(dir, "de");
  const lock = ((await readJsonFile(join(dir, LOCK_FILE_NAME))) as { locales: Locales }).locales;
  const provenance = (await readJsonFile(join(dir, PROVENANCE_FILE_NAME))) as {
    version: number;
    locales: Record<string, Record<string, Record<string, string>>>;
  };
  const hashOf = (key: string) => valueHash(values[key] ?? "");
  const de = provenance.locales.de ?? {};
  de.approved = {
    ...de.approved,
    origin: "machine",
    valueHash: hashOf("approved"),
    reviewState: "approved",
    reviewer: "Ana",
    reviewedSourceHash: lock.de?.approved ?? "",
  };
  de.staleApproval = {
    origin: "fuzzy",
    valueHash: hashOf("staleApproval"),
    reviewState: "approved",
    reviewer: "Ana",
    reviewedSourceHash: "0000000000000000",
  };
  de.rejected = { origin: "memory", valueHash: hashOf("rejected"), reviewState: "rejected" };
  de.human = { origin: "human", valueHash: hashOf("human"), reviewState: "approved" };
  de.imported = { origin: "import", valueHash: hashOf("imported") };
  de.external = { origin: "machine", provider: "deepl", valueHash: valueHash("Something else") };
  de.unknown = { origin: "unknown", valueHash: hashOf("unknown"), reviewState: "approved" };
  delete de.unrecorded;
  await writeJsonFile(join(dir, PROVENANCE_FILE_NAME), provenance);
  const { missing: _missing, ...kept } = values;
  await writeJsonFile(join(dir, "locales", "de.json"), { ...kept, orphan: "Verwaist" });
}

async function reportedProject(): Promise<string> {
  const dir = await translatedProject();
  await rewriteGerman(dir);
  return dir;
}

describe("provenanceReport", () => {
  it("puts every value in its bucket and lists each key in source order", async () => {
    const dir = await reportedProject();

    const report = await provenanceReport(
      { config: cfg(), cwd: dir, locales: ["de"], toolVersion: "1.2.3" },
      { now: () => FIXED_NOW },
    );

    expect(report).toMatchObject({
      available: true,
      generatedAt: "2026-09-29T08:00:00.000Z",
      toolVersion: "1.2.3",
      sourceLocale: "en",
    });
    if (!report.available) {
      throw new Error("expected a report");
    }
    const [de] = report.locales;
    expect(report.locales).toHaveLength(1);
    expect(de?.locale).toBe("de");
    expect(de?.entries.map((entry) => [entry.key, entry.bucket])).toEqual([
      ["machine", "machine-unreviewed"],
      ["approved", "machine-reviewed"],
      ["staleApproval", "machine-unreviewed"],
      ["rejected", "machine-unreviewed"],
      ["human", "human"],
      ["imported", "import"],
      ["external", "external"],
      ["unrecorded", "unrecorded"],
      ["unknown", "unknown"],
    ]);
    expect(de?.counts).toEqual({
      "machine-unreviewed": 3,
      "machine-reviewed": 1,
      human: 1,
      import: 1,
      external: 1,
      unrecorded: 1,
      unknown: 1,
    });
    expect(de?.total).toBe(9);
    expect(Object.keys(de?.counts ?? {})).toEqual([...PROVENANCE_BUCKETS]);
  });

  it("carries each key's origin, review state, provider and reviewer", async () => {
    const dir = await reportedProject();

    const report = await provenanceReport({ config: cfg(), cwd: dir, locales: ["de"] });

    const entries = report.available ? (report.locales[0]?.entries ?? []) : [];
    const byKey = new Map(entries.map((entry) => [entry.key, entry]));
    expect(byKey.get("machine")).toEqual({
      key: "machine",
      bucket: "machine-unreviewed",
      origin: "machine",
      provider: "deepl",
      reviewState: "unreviewed",
    });
    expect(byKey.get("approved")).toMatchObject({ reviewState: "approved", reviewer: "Ana" });
    expect(byKey.get("staleApproval")).toEqual({
      key: "staleApproval",
      bucket: "machine-unreviewed",
      origin: "fuzzy",
      reviewState: "unreviewed",
    });
    expect(byKey.get("rejected")).toMatchObject({ origin: "memory", reviewState: "rejected" });
    expect(byKey.get("human")).toMatchObject({ origin: "human", reviewState: "approved" });
    expect(byKey.get("external")).toEqual({
      key: "external",
      bucket: "external",
      origin: "external",
      reviewState: "unreviewed",
    });
  });

  it("reports every configured locale by default, in configured order", async () => {
    const dir = await reportedProject();

    const report = await provenanceReport({ config: cfg(), cwd: dir });

    expect(report.available && report.locales.map((locale) => locale.locale)).toEqual(["de", "fr"]);
    const fr = report.available ? report.locales[1] : undefined;
    expect(fr?.total).toBe(Object.keys(SOURCE).length);
    expect(fr?.counts["machine-unreviewed"]).toBe(Object.keys(SOURCE).length);
  });

  it("defaults the version to unknown and the timestamp to the current time", async () => {
    const dir = await reportedProject();
    const before = Date.now();

    const report = await provenanceReport({ config: cfg(), cwd: dir });

    expect(report.available && report.toolVersion).toBe("unknown");
    const generated = report.available ? Date.parse(report.generatedAt) : Number.NaN;
    expect(generated).toBeGreaterThanOrEqual(before - 1000);
  });

  it("lists every value as unrecorded in a project without a provenance file", async () => {
    const dir = await translatedProject();
    await rm(join(dir, PROVENANCE_FILE_NAME));

    const report = await provenanceReport({ config: cfg(), cwd: dir, locales: ["fr"] });

    expect(report.available && report.locales[0]?.counts.unrecorded).toBe(
      Object.keys(SOURCE).length,
    );
  });

  it.each([
    ["corrupt", "{ not json"],
    ["from a newer verbatra", JSON.stringify({ version: 2, locales: {} })],
  ])("is unavailable, not empty, when the provenance file is %s", async (_label, content) => {
    const dir = await reportedProject();
    await writeFile(join(dir, PROVENANCE_FILE_NAME), content, "utf8");

    expect(await provenanceReport({ config: cfg(), cwd: dir })).toEqual({
      available: false,
      reason: "provenance-unreadable",
    });
  });

  it("refuses a locale that is not configured", async () => {
    const dir = await reportedProject();

    await expect(
      provenanceReport({ config: cfg(), cwd: dir, locales: ["it"] }),
    ).rejects.toMatchObject({ code: "UNKNOWN_LOCALE" });
    await expect(provenanceReport({ config: cfg(), cwd: dir, locales: ["it"] })).rejects.toThrow(
      SdkError,
    );
  });
});
