import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import { loadLockFile } from "../lock/load-lock-file.js";
import { loadProvenance } from "../lock/load-provenance.js";
import { PROVENANCE_FILE_NAME } from "../lock/provenance-file.js";
import {
  baseConfig,
  makeStubProvider,
  makeTempDir,
  readJsonFile,
  readTextFile,
  writeJsonFile,
} from "../test-support.js";
import { approveLocale } from "./approve-locale.js";
import { editEntry } from "./edit-entry.js";
import { reviewQueue } from "./review-queue.js";
import { translate } from "./translate-project.js";

const cfg = (overrides: Partial<VerbatraConfig> = {}): VerbatraConfig =>
  baseConfig({ targetLocales: ["de", "fr"], ...overrides });

async function translatedProject(): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), {
    greeting: "Hello",
    farewell: "Bye",
    title: "Title",
  });
  await translate(
    { config: cfg(), cwd: dir },
    { createProvider: (provider) => makeStubProvider({ id: provider.id }).provider },
  );
  return dir;
}

async function queued(dir: string, locale: string): Promise<string[]> {
  const queue = await reviewQueue({ config: cfg(), cwd: dir, locales: [locale] });
  return queue.available ? queue.locales.flatMap((l) => l.needsReview.map((e) => e.key)) : [];
}

describe("approveLocale", () => {
  it("approves the locale's whole queue in one provenance write and leaves other locales alone", async () => {
    const dir = await translatedProject();
    const lockBefore = await readTextFile(join(dir, "verbatra.lock.json"));
    const targetBefore = await readTextFile(join(dir, "locales", "de.json"));

    const result = await approveLocale({ config: cfg(), cwd: dir, locale: "de", reviewer: "mk" });

    expect(result).toEqual({
      locale: "de",
      approved: ["greeting", "farewell", "title"],
      sourceChanged: [],
    });
    expect(await queued(dir, "de")).toEqual([]);
    expect(await queued(dir, "fr")).toEqual(["greeting", "farewell", "title"]);
    const lock = await loadLockFile({ cwd: dir });
    expect((await loadProvenance({ cwd: dir })).locales.de?.greeting).toMatchObject({
      origin: "machine",
      reviewState: "approved",
      reviewer: "mk",
      reviewedSourceHash: lock.locales.de?.greeting,
    });
    expect(await readTextFile(join(dir, "verbatra.lock.json"))).toBe(lockBefore);
    expect(await readTextFile(join(dir, "locales", "de.json"))).toBe(targetBefore);
  });

  it("approves only the requested origins", async () => {
    const dir = await translatedProject();
    await editEntry({
      config: cfg(),
      cwd: dir,
      locale: "de",
      key: "title",
      value: "Titel",
      actor: "agent",
    });

    const result = await approveLocale({
      config: cfg(),
      cwd: dir,
      locale: "de",
      origins: ["agent"],
    });

    expect(result.approved).toEqual(["title"]);
    expect(await queued(dir, "de")).toEqual(["greeting", "farewell"]);
  });

  it("leaves a value whose source changed unreviewed and lists it", async () => {
    const dir = await translatedProject();
    const lock = (await readJsonFile(join(dir, "verbatra.lock.json"))) as {
      locales: Record<string, Record<string, string>>;
    };
    await writeJsonFile(join(dir, "verbatra.lock.json"), {
      version: 1,
      locales: { ...lock.locales, de: { ...lock.locales.de, farewell: "an-older-source-hash" } },
    });

    const result = await approveLocale({ config: cfg(), cwd: dir, locale: "de" });

    expect(result).toEqual({
      locale: "de",
      approved: ["greeting", "title"],
      sourceChanged: ["farewell"],
    });
    expect(await queued(dir, "de")).toEqual(["farewell"]);
  });

  it("writes nothing when the queue is empty", async () => {
    const dir = await translatedProject();
    await approveLocale({ config: cfg(), cwd: dir, locale: "de" });
    const provenanceBefore = await readTextFile(join(dir, PROVENANCE_FILE_NAME));

    const result = await approveLocale({ config: cfg(), cwd: dir, locale: "de" });

    expect(result.approved).toEqual([]);
    expect(await readTextFile(join(dir, PROVENANCE_FILE_NAME))).toBe(provenanceBefore);
  });

  it("is reset by a later machine write, which puts the value back in the queue", async () => {
    const dir = await translatedProject();
    await approveLocale({ config: cfg(), cwd: dir, locale: "de" });

    await editEntry({
      config: cfg(),
      cwd: dir,
      locale: "de",
      key: "greeting",
      value: "Servus",
      actor: "agent",
    });

    expect(await queued(dir, "de")).toEqual(["greeting"]);
  });

  it("refuses an invalid reviewer, an invalid timeout, and an unknown locale before writing", async () => {
    const dir = await translatedProject();
    const provenanceBefore = await readTextFile(join(dir, PROVENANCE_FILE_NAME));

    await expect(
      approveLocale({ config: cfg(), cwd: dir, locale: "de", reviewer: "" }),
    ).rejects.toMatchObject({ code: "REVIEWER_INVALID" });
    await expect(
      approveLocale({ config: cfg(), cwd: dir, locale: "de", lockAcquireTimeoutMs: -1 }),
    ).rejects.toMatchObject({ code: "LOCK_TIMEOUT_INVALID" });
    await expect(approveLocale({ config: cfg(), cwd: dir, locale: "it" })).rejects.toMatchObject({
      code: "UNKNOWN_LOCALE",
    });
    expect(await readTextFile(join(dir, PROVENANCE_FILE_NAME))).toBe(provenanceBefore);
  });

  it("fails with PROVENANCE_FILE_INVALID on a corrupt provenance file", async () => {
    const dir = await translatedProject();
    await writeFile(join(dir, PROVENANCE_FILE_NAME), "{ not json", "utf8");

    await expect(approveLocale({ config: cfg(), cwd: dir, locale: "de" })).rejects.toMatchObject({
      code: "PROVENANCE_FILE_INVALID",
    });
  });

  it("fails with PROVENANCE_FILE_UNWRITABLE on a file from a newer verbatra, leaving it untouched", async () => {
    const dir = await translatedProject();
    await writeJsonFile(join(dir, PROVENANCE_FILE_NAME), { version: 99, locales: {} });
    const before = await readTextFile(join(dir, PROVENANCE_FILE_NAME));

    await expect(approveLocale({ config: cfg(), cwd: dir, locale: "de" })).rejects.toMatchObject({
      code: "PROVENANCE_FILE_UNWRITABLE",
      message: expect.stringContaining("newer verbatra"),
    });
    expect(await readTextFile(join(dir, PROVENANCE_FILE_NAME))).toBe(before);
  });
});
