import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import {
  baseConfig,
  makeStubProvider,
  makeTempDir,
  readJsonFile,
  writeJsonFile,
} from "../test-support.js";
import { check } from "./check.js";
import { diff } from "./diff.js";
import { emptySourceNotice } from "./empty-source.js";
import { keyIntegrity } from "./key-integrity.js";
import { lockState } from "./lock-state.js";
import { translate } from "./translate-project.js";
import { exportWorkbook } from "./workbook/export-workbook.js";

type LockFile = { locales: Record<string, Record<string, string>> };

async function project(
  source: Record<string, unknown>,
  targets: Record<string, Record<string, unknown>> = {},
): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), source);
  for (const [locale, values] of Object.entries(targets)) {
    await writeJsonFile(join(dir, "locales", `${locale}.json`), values);
  }
  return dir;
}

const cfg = (overrides: Partial<VerbatraConfig> = {}): VerbatraConfig =>
  baseConfig({ targetLocales: ["de"], ...overrides });

async function readLock(dir: string): Promise<LockFile> {
  return (await readJsonFile(join(dir, "verbatra.lock.json"))) as LockFile;
}

async function translatedThenBlanked(): Promise<string> {
  const dir = await project({ title: "Hello", other: "World" });
  const stub = makeStubProvider();
  await translate({ config: cfg(), cwd: dir }, { createProvider: () => stub.provider });
  await writeJsonFile(join(dir, "locales", "en.json"), { title: " ", other: "World" });
  return dir;
}

describe("emptySourceNotice", () => {
  it("raises nothing when no key has an empty source", () => {
    expect(emptySourceNotice([])).toBeUndefined();
  });

  it("names one key in the singular", () => {
    expect(emptySourceNotice(["a"])).toEqual({
      code: "SOURCE_VALUE_EMPTY",
      message:
        '1 key has an empty source value, so nothing is translated for it: "a". ' +
        "Write the source text, then run verbatra translate again.",
    });
  });

  it("names the first five keys and counts the rest", () => {
    const notice = emptySourceNotice(["a", "b", "c", "d", "e", "f", "g"]);
    expect(notice?.message).toBe(
      '7 keys have an empty source value, so nothing is translated for them: "a", "b", "c", ' +
        '"d", "e", and 2 more. Write the source text, then run verbatra translate again.',
    );
  });
});

describe("a source key with an empty value", () => {
  it("is never sent to the provider, written, or locked, and is reported by a notice", async () => {
    const dir = await project({ greeting: "Hello", missing: { in: { source: "" } }, blank: "  " });
    const stub = makeStubProvider();

    const summary = await translate(
      { config: cfg(), cwd: dir },
      { createProvider: () => stub.provider },
    );

    const sent = stub.calls.flatMap((call) => call.request.entries.map((entry) => entry.key));
    expect(sent).toEqual(["greeting"]);
    const de = summary.locales[0];
    expect(de?.status).toBe("succeeded");
    expect(de?.translated).toEqual(["greeting"]);
    expect(de?.notices.map((notice) => notice.code)).toContain("SOURCE_VALUE_EMPTY");
    expect(await readJsonFile(join(dir, "locales", "de.json"))).toEqual({
      greeting: "[de] Hello",
    });
    expect(Object.keys((await readLock(dir)).locales.de ?? {})).toEqual(["greeting"]);
  });

  it("is not counted as would-translate on a dry run, which still raises the notice", async () => {
    const dir = await project({ greeting: "Hello", empty: "" });

    const summary = await translate({ config: cfg(), cwd: dir, dryRun: true });

    expect(summary.locales[0]?.translated).toEqual(["greeting"]);
    expect(summary.locales[0]?.notices.map((notice) => notice.code)).toContain(
      "SOURCE_VALUE_EMPTY",
    );
  });

  it("is not listed as unfilled under provider none", async () => {
    const dir = await project({ greeting: "Hello", empty: "" });

    const summary = await translate({
      config: cfg({ provider: { id: "none", options: {} } }),
      cwd: dir,
    });

    expect(summary.locales[0]?.unfilled).toEqual(["greeting"]);
  });

  it("leaves diff pending only for translatable keys and lists the empty one apart", async () => {
    const dir = await project({ greeting: "Hello", empty: "" }, { de: { greeting: "Hallo" } });

    const summary = await diff({ config: cfg(), cwd: dir });

    expect(summary.hasPendingChanges).toBe(false);
    expect(summary.locales[0]).toMatchObject({
      missing: [],
      changed: [],
      orphaned: [],
      emptySource: ["empty"],
      hasPendingChanges: false,
    });
  });

  it("keeps check in sync and counts the empty key apart", async () => {
    const dir = await project({ greeting: "Hello", empty: "" }, { de: { greeting: "Hallo" } });

    const summary = await check({ config: cfg(), cwd: dir });

    expect(summary.inSync).toBe(true);
    expect(summary.locales[0]).toMatchObject({
      missing: 0,
      stale: 0,
      emptySource: 1,
      inSync: true,
    });
  });

  it("gets no export row", async () => {
    const dir = await project({ greeting: "Hello", empty: "" });

    const result = await exportWorkbook({ config: cfg(), cwd: dir, format: "csv", out: "out" });

    expect(result.locales).toEqual([{ locale: "de", rows: 1 }]);
    const csv = await readFile(join(dir, "out", "de.csv"), "utf8");
    expect(csv).toContain("greeting");
    expect(csv).not.toContain("empty");
  });

  it("generates no plural form from source forms that are all empty", async () => {
    const dir = await project({ items_one: "", items_other: "" });
    const stub = makeStubProvider();

    const summary = await translate(
      { config: cfg({ targetLocales: ["fr"], generatePlurals: true }), cwd: dir },
      { createProvider: () => stub.provider },
    );

    expect(stub.calls).toEqual([]);
    expect(summary.locales[0]?.generated).toEqual([]);
  });
});

describe("a source value blanked after translation", () => {
  it("keeps the old target value and its lock baseline", async () => {
    const dir = await translatedThenBlanked();
    const before = await readLock(dir);
    const stub = makeStubProvider();

    const summary = await translate(
      { config: cfg(), cwd: dir },
      { createProvider: () => stub.provider },
    );

    expect(stub.calls).toEqual([]);
    expect(summary.locales[0]?.notices.map((notice) => notice.code)).toContain(
      "SOURCE_VALUE_EMPTY",
    );
    expect(await readJsonFile(join(dir, "locales", "de.json"))).toEqual({
      title: "[de] Hello",
      other: "[de] World",
    });
    expect((await readLock(dir)).locales.de).toEqual(before.locales.de);
  });

  it("is translated again once the source text is written", async () => {
    const dir = await translatedThenBlanked();
    await writeJsonFile(join(dir, "locales", "en.json"), { title: "Hi", other: "World" });
    const stub = makeStubProvider();

    const summary = await translate(
      { config: cfg(), cwd: dir },
      { createProvider: () => stub.provider },
    );

    expect(summary.locales[0]?.translated).toEqual(["title"]);
  });

  it("keeps every lock entry in lockState and counts the key in no bucket", async () => {
    const dir = await translatedThenBlanked();

    const state = await lockState({ config: cfg(), cwd: dir });

    expect(state).toEqual({
      exists: true,
      version: expect.any(Number),
      locales: [
        expect.objectContaining({ locale: "de", keyCount: 2, missing: 0, stale: 0, upToDate: 1 }),
      ],
    });
  });

  it("is not judged by keyIntegrity, since nothing will be translated against it", async () => {
    const dir = await translatedThenBlanked();

    const result = await keyIntegrity({ config: cfg(), cwd: dir });

    expect(result).toEqual([{ locale: "de", entries: [] }]);
  });

  it("still reports a target-only key as orphaned", async () => {
    const dir = await translatedThenBlanked();
    await writeJsonFile(join(dir, "locales", "de.json"), {
      title: "[de] Hello",
      other: "[de] World",
      gone: "Weg",
    });

    const summary = await diff({ config: cfg(), cwd: dir });

    expect(summary.locales[0]).toMatchObject({ orphaned: ["gone"], emptySource: ["title"] });
  });
});
