import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cacheFilePath } from "../cache/translation-memory.js";
import type { VerbatraConfig } from "../config/schema.js";
import { defaultFs, type SdkFs } from "../fs.js";
import { loadLockFile } from "../lock/load-lock-file.js";
import { loadProvenance } from "../lock/load-provenance.js";
import { PROVENANCE_FILE_NAME, type ProvenanceRecord, valueHash } from "../lock/provenance-file.js";
import type { CreateProvider } from "../selection/select-provider.js";
import {
  baseConfig,
  makeStubProvider,
  makeTempDir,
  readJsonFile,
  readTextFile,
  writeJsonFile,
} from "../test-support.js";
import { check } from "./check.js";
import { editEntry } from "./edit-entry.js";
import { keyValue } from "./key-value.js";
import { approveEntry, rejectEntry } from "./review-decision.js";
import { translate } from "./translate-project.js";

const cfg = (overrides: Partial<VerbatraConfig> = {}): VerbatraConfig =>
  baseConfig({ targetLocales: ["de"], ...overrides });

const stubCreate: CreateProvider = (config) => makeStubProvider({ id: config.id }).provider;

async function project(source: Record<string, string>): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), source);
  return dir;
}

async function translated(source: Record<string, string>): Promise<string> {
  const dir = await project(source);
  await translate({ config: cfg(), cwd: dir }, { createProvider: stubCreate });
  return dir;
}

async function targetValues(dir: string): Promise<Record<string, string>> {
  return (await readJsonFile(join(dir, "locales", "de.json"))) as Record<string, string>;
}

async function currentValue(dir: string, key: string): Promise<string> {
  const value = (await targetValues(dir))[key];
  if (value === undefined) {
    throw new Error(`no translation for ${key}`);
  }
  return value;
}

async function recordOf(dir: string, key: string): Promise<ProvenanceRecord | undefined> {
  return (await loadProvenance({ cwd: dir })).locales.de?.[key];
}

describe("approveEntry", () => {
  it("records the approval, the source it was given against, and the reviewer", async () => {
    const dir = await translated({ greeting: "Hello" });
    const value = await currentValue(dir, "greeting");
    const lockBefore = await readTextFile(join(dir, "verbatra.lock.json"));
    const targetBefore = await readTextFile(join(dir, "locales", "de.json"));

    const result = await approveEntry({
      config: cfg(),
      cwd: dir,
      locale: "de",
      key: "greeting",
      expectedValue: value,
      reviewer: "mk",
    });

    expect(result).toEqual({
      locale: "de",
      key: "greeting",
      provenance: {
        origin: "machine",
        provider: "anthropic",
        model: "test-model",
        reviewState: "approved",
        reviewer: "mk",
      },
    });
    expect(await recordOf(dir, "greeting")).toEqual({
      origin: "machine",
      provider: "anthropic",
      model: "test-model",
      valueHash: valueHash(value),
      reviewState: "approved",
      reviewer: "mk",
      reviewedSourceHash: (await loadLockFile({ cwd: dir })).locales.de?.greeting,
    });
    expect(await readTextFile(join(dir, "verbatra.lock.json"))).toBe(lockBefore);
    expect(await readTextFile(join(dir, "locales", "de.json"))).toBe(targetBefore);
  });

  it("stores no reviewer when none is supplied", async () => {
    const dir = await translated({ greeting: "Hello" });
    const value = await currentValue(dir, "greeting");

    await approveEntry({
      config: cfg(),
      cwd: dir,
      locale: "de",
      key: "greeting",
      expectedValue: value,
    });

    expect((await recordOf(dir, "greeting"))?.reviewer).toBeUndefined();
  });

  it("keeps the earlier reviewer when the same value is approved again without one", async () => {
    const dir = await translated({ greeting: "Hello" });
    const value = await currentValue(dir, "greeting");
    const input = { config: cfg(), cwd: dir, locale: "de", key: "greeting", expectedValue: value };
    await approveEntry({ ...input, reviewer: "first" });

    const again = await approveEntry(input);

    expect(again.provenance.reviewer).toBe("first");
    expect((await recordOf(dir, "greeting"))?.reviewer).toBe("first");
  });

  it("replaces the earlier reviewer when a new one approves the same value", async () => {
    const dir = await translated({ greeting: "Hello" });
    const value = await currentValue(dir, "greeting");
    const input = { config: cfg(), cwd: dir, locale: "de", key: "greeting", expectedValue: value };
    await approveEntry({ ...input, reviewer: "first" });

    await approveEntry({ ...input, reviewer: "second" });

    expect((await recordOf(dir, "greeting"))?.reviewer).toBe("second");
  });

  it("writes nothing when the same approval is recorded twice", async () => {
    const dir = await translated({ greeting: "Hello" });
    const value = await currentValue(dir, "greeting");
    const input = { config: cfg(), cwd: dir, locale: "de", key: "greeting", expectedValue: value };
    await approveEntry(input);
    const written: string[] = [];
    const fs: SdkFs = {
      ...defaultFs,
      writeFile: async (path, content) => {
        written.push(path);
        await defaultFs.writeFile(path, content);
      },
    };

    const again = await approveEntry(input, { fs });

    expect(again.provenance.reviewState).toBe("approved");
    expect(written).toEqual([]);
  });

  it("records a value with no record yet as unknown", async () => {
    const dir = await translated({ greeting: "Hello" });
    await rm(join(dir, PROVENANCE_FILE_NAME));

    const result = await approveEntry({
      config: cfg(),
      cwd: dir,
      locale: "de",
      key: "greeting",
      expectedValue: await currentValue(dir, "greeting"),
    });

    expect(result.provenance).toEqual({ origin: "unknown", reviewState: "approved" });
  });

  it("records a value changed outside verbatra as unknown, replacing the stale record", async () => {
    const dir = await translated({ greeting: "Hello" });
    await writeJsonFile(join(dir, "locales", "de.json"), { greeting: "Servus" });

    const result = await approveEntry({
      config: cfg(),
      cwd: dir,
      locale: "de",
      key: "greeting",
      expectedValue: "Servus",
    });

    expect(result.provenance).toEqual({ origin: "unknown", reviewState: "approved" });
    expect((await recordOf(dir, "greeting"))?.provider).toBeUndefined();
  });

  it("refuses a value the reviewer did not see with REVIEW_VALUE_CHANGED, writing nothing", async () => {
    const dir = await translated({ greeting: "Hello" });

    await expect(
      approveEntry({
        config: cfg(),
        cwd: dir,
        locale: "de",
        key: "greeting",
        expectedValue: "something else",
      }),
    ).rejects.toMatchObject({ code: "REVIEW_VALUE_CHANGED" });
    expect((await recordOf(dir, "greeting"))?.reviewState).toBeUndefined();
  });

  it("accepts an expected value that differs only in line endings", async () => {
    const dir = await project({ greeting: "Line one\nLine two" });
    await translate({ config: cfg(), cwd: dir }, { createProvider: stubCreate });
    const value = await currentValue(dir, "greeting");
    expect(value).toContain("\n");

    const result = await approveEntry({
      config: cfg(),
      cwd: dir,
      locale: "de",
      key: "greeting",
      expectedValue: value.replaceAll("\n", "\r\n"),
    });

    expect(result.provenance.reviewState).toBe("approved");
  });

  it("refuses a key with no translation with REVIEW_VALUE_CHANGED", async () => {
    const dir = await translated({ greeting: "Hello" });
    await writeJsonFile(join(dir, "locales", "en.json"), { greeting: "Hello", farewell: "Bye" });

    await expect(
      approveEntry({ config: cfg(), cwd: dir, locale: "de", key: "farewell", expectedValue: "" }),
    ).rejects.toMatchObject({ code: "REVIEW_VALUE_CHANGED" });
  });

  it("refuses a value whose source changed since it was written with REVIEW_SOURCE_CHANGED", async () => {
    const dir = await translated({ greeting: "Hello" });
    const value = await currentValue(dir, "greeting");
    await writeJsonFile(join(dir, "locales", "en.json"), { greeting: "Hello there" });

    await expect(
      approveEntry({
        config: cfg(),
        cwd: dir,
        locale: "de",
        key: "greeting",
        expectedValue: value,
      }),
    ).rejects.toMatchObject({ code: "REVIEW_SOURCE_CHANGED" });
    expect((await recordOf(dir, "greeting"))?.reviewState).toBeUndefined();
  });

  it("refuses a value with no lock entry with REVIEW_SOURCE_CHANGED", async () => {
    const dir = await project({ greeting: "Hello" });
    await writeJsonFile(join(dir, "locales", "de.json"), { greeting: "Hallo" });

    await expect(
      approveEntry({
        config: cfg(),
        cwd: dir,
        locale: "de",
        key: "greeting",
        expectedValue: "Hallo",
      }),
    ).rejects.toMatchObject({ code: "REVIEW_SOURCE_CHANGED" });
  });

  it("is reset to unreviewed by a later edit of the value", async () => {
    const dir = await translated({ greeting: "Hello" });
    const value = await currentValue(dir, "greeting");
    await approveEntry({
      config: cfg(),
      cwd: dir,
      locale: "de",
      key: "greeting",
      expectedValue: value,
    });

    await editEntry({ config: cfg(), cwd: dir, locale: "de", key: "greeting", value: "Hallo" });

    expect(
      (await keyValue({ config: cfg(), cwd: dir, locale: "de", key: "greeting" })).provenance,
    ).toEqual({ origin: "human", reviewState: "unreviewed" });
  });
});

describe("approveEntry and rejectEntry: boundary checks", () => {
  it.each([
    ["missing", undefined],
    ["a number", 42],
    ["null", null],
  ])(
    "refuses an expectedValue that is %s with REVIEW_VALUE_CHANGED before anything is read",
    async (_label, expectedValue) => {
      const dir = await makeTempDir();
      const input = {
        config: cfg(),
        cwd: dir,
        locale: "de",
        key: "greeting",
        expectedValue,
      } as unknown as Parameters<typeof rejectEntry>[0];

      await expect(approveEntry(input)).rejects.toMatchObject({ code: "REVIEW_VALUE_CHANGED" });
      await expect(rejectEntry(input)).rejects.toMatchObject({ code: "REVIEW_VALUE_CHANGED" });
    },
  );

  it.each([
    ["an empty name", ""],
    ["a name longer than 64 characters", "x".repeat(65)],
    ["a line break", "mk\nroot"],
    ["a C1 control character", "mk\u0085"],
    ["an escape sequence", "\u001b[31mmk"],
  ])("refuses %s with REVIEWER_INVALID before anything is read", async (_label, reviewer) => {
    const dir = await makeTempDir();
    const input = {
      config: cfg(),
      cwd: dir,
      locale: "de",
      key: "greeting",
      expectedValue: "x",
      reviewer,
    };

    await expect(approveEntry(input)).rejects.toMatchObject({ code: "REVIEWER_INVALID" });
    await expect(rejectEntry(input)).rejects.toMatchObject({ code: "REVIEWER_INVALID" });
  });

  it.each([[-1], [1.5], [Number.NaN]])(
    "refuses a lockAcquireTimeoutMs of %s with LOCK_TIMEOUT_INVALID before anything is read",
    async (lockAcquireTimeoutMs) => {
      const input = {
        config: cfg(),
        cwd: "/nonexistent",
        locale: "de",
        key: "greeting",
        expectedValue: "x",
        lockAcquireTimeoutMs,
      };

      await expect(approveEntry(input)).rejects.toMatchObject({ code: "LOCK_TIMEOUT_INVALID" });
      await expect(rejectEntry(input)).rejects.toMatchObject({ code: "LOCK_TIMEOUT_INVALID" });
    },
  );

  it("accepts a 64-character reviewer with non-ASCII letters", async () => {
    const dir = await translated({ greeting: "Hello" });
    const reviewer = `Zoë ${"a".repeat(60)}`;

    const result = await approveEntry({
      config: cfg(),
      cwd: dir,
      locale: "de",
      key: "greeting",
      expectedValue: await currentValue(dir, "greeting"),
      reviewer,
    });

    expect(result.provenance.reviewer).toBe(reviewer);
  });

  it("throws UNKNOWN_LOCALE for a locale that is not a configured target", async () => {
    const dir = await translated({ greeting: "Hello" });

    await expect(
      rejectEntry({ config: cfg(), cwd: dir, locale: "fr", key: "greeting", expectedValue: "x" }),
    ).rejects.toMatchObject({ code: "UNKNOWN_LOCALE" });
  });

  it.each(["missing", "__proto__", "constructor"])(
    "throws UNKNOWN_KEY for the key %s, which the source does not hold",
    async (key) => {
      const dir = await translated({ greeting: "Hello" });

      await expect(
        approveEntry({ config: cfg(), cwd: dir, locale: "de", key, expectedValue: "x" }),
      ).rejects.toMatchObject({ code: "UNKNOWN_KEY" });
    },
  );

  it("fails on a corrupt provenance file with PROVENANCE_FILE_INVALID, removing nothing", async () => {
    const dir = await translated({ greeting: "Hello" });
    const value = await currentValue(dir, "greeting");
    await writeFile(join(dir, PROVENANCE_FILE_NAME), "{ not json", "utf8");

    await expect(
      rejectEntry({ config: cfg(), cwd: dir, locale: "de", key: "greeting", expectedValue: value }),
    ).rejects.toMatchObject({ code: "PROVENANCE_FILE_INVALID" });
    expect(await targetValues(dir)).toEqual({ greeting: value });
  });

  it.each([
    ["approveEntry", approveEntry],
    ["rejectEntry", rejectEntry],
  ])(
    "%s refuses a provenance file from a newer verbatra with PROVENANCE_FILE_UNWRITABLE, writing nothing",
    async (_name, decide) => {
      const dir = await translated({ greeting: "Hello" });
      const value = await currentValue(dir, "greeting");
      const newer = `${JSON.stringify({ version: 99, locales: {} })}\n`;
      await writeFile(join(dir, PROVENANCE_FILE_NAME), newer, "utf8");
      const lockBefore = await readTextFile(join(dir, "verbatra.lock.json"));

      await expect(
        decide({ config: cfg(), cwd: dir, locale: "de", key: "greeting", expectedValue: value }),
      ).rejects.toMatchObject({
        code: "PROVENANCE_FILE_UNWRITABLE",
        message: expect.stringContaining("newer verbatra"),
      });
      expect(await readTextFile(join(dir, PROVENANCE_FILE_NAME))).toBe(newer);
      expect(await targetValues(dir)).toEqual({ greeting: value });
      expect(await readTextFile(join(dir, "verbatra.lock.json"))).toBe(lockBefore);
    },
  );
});

describe("rejectEntry", () => {
  it("removes the value and its lock entry and keeps a rejected record of the removed text", async () => {
    const dir = await translated({ greeting: "Hello", farewell: "Bye" });
    const value = await currentValue(dir, "greeting");
    const farewell = await currentValue(dir, "farewell");

    const result = await rejectEntry({
      config: cfg(),
      cwd: dir,
      locale: "de",
      key: "greeting",
      expectedValue: value,
      reviewer: "mk",
    });

    expect(result).toEqual({
      locale: "de",
      key: "greeting",
      provenance: {
        origin: "machine",
        provider: "anthropic",
        model: "test-model",
        reviewState: "rejected",
        reviewer: "mk",
      },
    });
    expect(await targetValues(dir)).toEqual({ farewell });
    expect(Object.keys((await loadLockFile({ cwd: dir })).locales.de ?? {})).toEqual(["farewell"]);
    expect(await recordOf(dir, "greeting")).toEqual({
      origin: "machine",
      provider: "anthropic",
      model: "test-model",
      valueHash: valueHash(value),
      reviewState: "rejected",
      reviewer: "mk",
    });
  });

  it("leaves the key missing, so check reports drift and the next translate replaces it", async () => {
    const dir = await translated({ greeting: "Hello" });
    const value = await currentValue(dir, "greeting");
    await rejectEntry({
      config: cfg(),
      cwd: dir,
      locale: "de",
      key: "greeting",
      expectedValue: value,
    });

    expect((await check({ config: cfg(), cwd: dir })).locales[0]?.missing).toBe(1);

    const { provider, calls } = makeStubProvider();
    await translate({ config: cfg(), cwd: dir }, { createProvider: () => provider });

    expect(calls).toHaveLength(1);
    expect(await recordOf(dir, "greeting")).toMatchObject({ origin: "machine" });
    expect((await recordOf(dir, "greeting"))?.reviewState).toBeUndefined();
  });

  it("records the rejection on a key that has a record but no lock entry", async () => {
    const dir = await translated({ greeting: "Hello" });
    const value = await currentValue(dir, "greeting");
    await writeJsonFile(join(dir, "verbatra.lock.json"), { version: 1, locales: { de: {} } });
    expect((await recordOf(dir, "greeting"))?.origin).toBe("machine");

    await rejectEntry({
      config: cfg(),
      cwd: dir,
      locale: "de",
      key: "greeting",
      expectedValue: value,
    });

    expect(await recordOf(dir, "greeting")).toMatchObject({
      origin: "machine",
      valueHash: valueHash(value),
      reviewState: "rejected",
    });
  });

  it("drops the rejected text from the translation memory, keeping the other entries", async () => {
    const dir = await translated({ greeting: "Hello", farewell: "Bye" });
    const value = await currentValue(dir, "greeting");
    const memoryBefore = await readTextFile(cacheFilePath(dir));
    expect(memoryBefore).toContain(JSON.stringify(value));

    await rejectEntry({
      config: cfg(),
      cwd: dir,
      locale: "de",
      key: "greeting",
      expectedValue: value,
    });

    const memoryAfter = await readTextFile(cacheFilePath(dir));
    expect(memoryAfter).not.toContain(JSON.stringify(value));
    expect(memoryAfter).toContain(JSON.stringify(await currentValue(dir, "farewell")));
  });

  it("records a value with no record yet as unknown and rejects a stale value too", async () => {
    const dir = await project({ greeting: "Hello" });
    await writeJsonFile(join(dir, "locales", "de.json"), { greeting: "Hallo" });

    const result = await rejectEntry({
      config: cfg(),
      cwd: dir,
      locale: "de",
      key: "greeting",
      expectedValue: "Hallo",
    });

    expect(result.provenance).toEqual({ origin: "unknown", reviewState: "rejected" });
    expect(await targetValues(dir)).toEqual({});
  });

  it("refuses a value the reviewer did not see with REVIEW_VALUE_CHANGED, removing nothing", async () => {
    const dir = await translated({ greeting: "Hello" });
    const value = await currentValue(dir, "greeting");

    await expect(
      rejectEntry({
        config: cfg(),
        cwd: dir,
        locale: "de",
        key: "greeting",
        expectedValue: `${value}!`,
      }),
    ).rejects.toMatchObject({ code: "REVIEW_VALUE_CHANGED" });
    expect(await targetValues(dir)).toEqual({ greeting: value });
  });

  it("keeps the rejected record through a pruning run while the key stays missing", async () => {
    const dir = await translated({ greeting: "Hello" });
    const value = await currentValue(dir, "greeting");
    await rejectEntry({
      config: cfg(),
      cwd: dir,
      locale: "de",
      key: "greeting",
      expectedValue: value,
    });

    await translate(
      { config: cfg({ provider: { id: "none", options: {} } }), cwd: dir, prune: true },
      {},
    );

    expect((await recordOf(dir, "greeting"))?.reviewState).toBe("rejected");
    expect(await readdir(join(dir, "locales"))).toContain("de.json");
  });
});
