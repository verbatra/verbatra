import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { ProviderError } from "@verbatra/ai-providers";
import { AdapterError, AdapterRegistry, createDefaultRegistry } from "@verbatra/format-adapters";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import { SdkError } from "../errors.js";
import { defaultFs, type SdkFs } from "../fs.js";
import { loadProvenance } from "../lock/load-provenance.js";
import { localeLockPath } from "../lock/locale-write-lock.js";
import { PROVENANCE_FILE_NAME } from "../lock/provenance-file.js";
import type { CreateProvider } from "../selection/select-provider.js";
import {
  baseConfig,
  makeStubProvider,
  makeTempDir,
  readJsonFile,
  writeJsonFile,
} from "../test-support.js";
import { editEntry } from "./edit-entry.js";
import {
  approveEntries,
  BatchInterruptedError,
  type RetranslateBatchOutcome,
  rejectEntries,
  retranslateEntries,
} from "./entry-batch.js";
import { translate } from "./translate-project.js";

const cfg = (overrides: Partial<VerbatraConfig> = {}): VerbatraConfig =>
  baseConfig({ targetLocales: ["de"], ...overrides });

const stubCreate: CreateProvider = (config) => makeStubProvider({ id: config.id }).provider;

async function translated(source: Record<string, string>): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), source);
  await translate({ config: cfg(), cwd: dir }, { createProvider: stubCreate });
  return dir;
}

async function targetValues(dir: string): Promise<Record<string, string>> {
  return (await readJsonFile(join(dir, "locales", "de.json"))) as Record<string, string>;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("approveEntries", () => {
  it("approves every entry in order and records the reviewer on each", async () => {
    const dir = await translated({ greeting: "Hello", farewell: "Bye" });

    const { results } = await approveEntries({
      config: cfg(),
      cwd: dir,
      reviewer: "mk",
      entries: [
        { locale: "de", key: "farewell", expectedValue: "[de] Bye" },
        { locale: "de", key: "greeting", expectedValue: "[de] Hello" },
      ],
    });

    expect(results.map((result) => [result.key, result.ok])).toEqual([
      ["farewell", true],
      ["greeting", true],
    ]);
    const records = (await loadProvenance({ cwd: dir })).locales.de;
    expect(records?.greeting?.reviewState).toBe("approved");
    expect(records?.farewell?.reviewer).toBe("mk");
  });

  it("reports a refused entry with its code and carries on with the next one", async () => {
    const dir = await translated({ greeting: "Hello", farewell: "Bye" });

    const { results } = await approveEntries({
      config: cfg(),
      cwd: dir,
      entries: [
        { locale: "de", key: "greeting", expectedValue: "not what is on disk" },
        { locale: "fr", key: "greeting", expectedValue: "[de] Hello" },
        { locale: "de", key: "farewell", expectedValue: "[de] Bye" },
      ],
    });

    expect(results).toEqual([
      expect.objectContaining({
        locale: "de",
        key: "greeting",
        ok: false,
        code: "REVIEW_VALUE_CHANGED",
      }),
      expect.objectContaining({ locale: "fr", key: "greeting", ok: false, code: "UNKNOWN_LOCALE" }),
      expect.objectContaining({ locale: "de", key: "farewell", ok: true }),
    ]);
    expect((await loadProvenance({ cwd: dir })).locales.de?.greeting?.reviewState).toBeUndefined();
  });

  it("answers an empty batch with no results and touches nothing", async () => {
    const dir = await translated({ greeting: "Hello" });

    await expect(approveEntries({ config: cfg(), cwd: dir, entries: [] })).resolves.toEqual({
      results: [],
    });
  });

  it("resolves the files against the process working directory when no cwd is given", async () => {
    const dir = await translated({ greeting: "Hello" });
    vi.spyOn(process, "cwd").mockReturnValue(dir);

    const { results } = await approveEntries({
      config: cfg(),
      entries: [{ locale: "de", key: "greeting", expectedValue: "[de] Hello" }],
    });

    expect(results[0]?.ok).toBe(true);
  });
});

describe("rejectEntries", () => {
  it("removes every rejected translation and records the decisions", async () => {
    const dir = await translated({ greeting: "Hello", farewell: "Bye", title: "Title" });

    const { results } = await rejectEntries({
      config: cfg(),
      cwd: dir,
      entries: [
        { locale: "de", key: "greeting", expectedValue: "[de] Hello" },
        { locale: "de", key: "farewell", expectedValue: "[de] Bye" },
      ],
    });

    expect(results.every((result) => result.ok)).toBe(true);
    expect(await targetValues(dir)).toEqual({ title: "[de] Title" });
    const records = (await loadProvenance({ cwd: dir })).locales.de;
    expect(records?.greeting?.reviewState).toBe("rejected");
    expect(records?.farewell?.reviewState).toBe("rejected");
  });

  it("keeps a translation whose value changed since it was reviewed", async () => {
    const dir = await translated({ greeting: "Hello", farewell: "Bye" });
    await editEntry({ config: cfg(), cwd: dir, locale: "de", key: "greeting", value: "Hallo" });

    const { results } = await rejectEntries({
      config: cfg(),
      cwd: dir,
      entries: [
        { locale: "de", key: "greeting", expectedValue: "[de] Hello" },
        { locale: "de", key: "farewell", expectedValue: "[de] Bye" },
      ],
    });

    expect(results.map((result) => result.ok)).toEqual([false, true]);
    expect(await targetValues(dir)).toEqual({ greeting: "Hallo" });
  });

  it("passes the reviewer on to every decision", async () => {
    const dir = await translated({ greeting: "Hello" });

    const { results } = await rejectEntries({
      config: cfg(),
      cwd: dir,
      reviewer: "x".repeat(65),
      entries: [{ locale: "de", key: "greeting", expectedValue: "[de] Hello" }],
    });

    expect(results[0]).toMatchObject({ ok: false, code: "REVIEWER_INVALID" });
  });
});

describe("retranslateEntries", () => {
  it("retranslates every entry and reports what each single retranslation returned", async () => {
    const dir = await translated({ greeting: "Hello", farewell: "Bye" });
    const stub = makeStubProvider({ translate: (value) => `neu ${value}` });

    const { results } = await retranslateEntries(
      {
        config: cfg(),
        cwd: dir,
        entries: [
          { locale: "de", key: "greeting" },
          { locale: "de", key: "farewell" },
        ],
      },
      { createProvider: () => stub.provider },
    );

    expect(results).toEqual([
      {
        locale: "de",
        key: "greeting",
        ok: true,
        result: { accepted: true, value: "neu Hello", reviewReasons: [] },
      },
      {
        locale: "de",
        key: "farewell",
        ok: true,
        result: { accepted: true, value: "neu Bye", reviewReasons: [] },
      },
    ]);
    expect(stub.calls).toHaveLength(2);
    expect(await targetValues(dir)).toEqual({ greeting: "neu Hello", farewell: "neu Bye" });
  });

  it("refuses a value a person wrote unless includeHuman is set", async () => {
    const dir = await translated({ greeting: "Hello" });
    await editEntry({ config: cfg(), cwd: dir, locale: "de", key: "greeting", value: "Hallo" });
    const stub = makeStubProvider();
    const entries = [{ locale: "de", key: "greeting" }];

    const refused = await retranslateEntries(
      { config: cfg(), cwd: dir, entries },
      { createProvider: () => stub.provider },
    );
    const replaced = await retranslateEntries(
      { config: cfg(), cwd: dir, entries, includeHuman: true },
      { createProvider: () => stub.provider },
    );

    expect(refused.results[0]).toMatchObject({ ok: false, code: "KEY_PROTECTED" });
    expect(replaced.results[0]).toMatchObject({ ok: true, result: { accepted: true } });
  });

  it("reports a provider failure as that entry's outcome", async () => {
    const dir = await translated({ greeting: "Hello" });
    const stub = makeStubProvider({
      throwForLocales: new Set(["de"]),
      error: new ProviderError("RATE_LIMITED", "slow down"),
    });

    const { results } = await retranslateEntries(
      { config: cfg(), cwd: dir, entries: [{ locale: "de", key: "greeting" }] },
      { createProvider: () => stub.provider },
    );

    expect(results[0]).toEqual({
      locale: "de",
      key: "greeting",
      ok: false,
      code: "RATE_LIMITED",
      message: "slow down",
    });
  });

  it("resolves the files against the process working directory when no cwd is given", async () => {
    const dir = await translated({ greeting: "Hello" });
    vi.spyOn(process, "cwd").mockReturnValue(dir);

    const { results } = await retranslateEntries(
      { config: cfg(), entries: [{ locale: "de", key: "greeting" }] },
      { createProvider: stubCreate },
    );

    expect(results[0]?.ok).toBe(true);
  });

  it("stops at an error that is not an outcome of one entry, carrying what was already done", async () => {
    const dir = await translated({ greeting: "Hello", farewell: "Bye", later: "Later" });
    const base = makeStubProvider({ translate: (value) => `neu ${value}` });
    let calls = 0;
    const failure = new TypeError("programming error sk-ant-api03-abcdefghijklmnopqrstuvwxyz");
    const provider = {
      ...base.provider,
      translateBatch: async (request: Parameters<typeof base.provider.translateBatch>[0]) => {
        calls += 1;
        if (calls === 2) {
          throw failure;
        }
        return base.provider.translateBatch(request);
      },
    };

    const error = await retranslateEntries(
      {
        config: cfg(),
        cwd: dir,
        entries: [
          { locale: "de", key: "greeting" },
          { locale: "de", key: "farewell" },
          { locale: "de", key: "later" },
        ],
      },
      { createProvider: () => provider },
    ).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(BatchInterruptedError);
    const interrupted = error as BatchInterruptedError<RetranslateBatchOutcome>;
    expect(interrupted.name).toBe("BatchInterruptedError");
    expect(interrupted.cause).toBe(failure);
    expect(interrupted.entry).toEqual({ locale: "de", key: "farewell" });
    expect(interrupted.results).toEqual([
      {
        locale: "de",
        key: "greeting",
        ok: true,
        result: { accepted: true, value: "neu Hello", reviewReasons: [] },
      },
    ]);
    expect(interrupted.message).toContain('stopped at "farewell" in de after 1 completed entry');
    expect(interrupted.message).not.toContain("sk-ant-api03");
    expect(calls).toBe(2);
    expect((await targetValues(dir)).greeting).toBe("neu Hello");
  });

  it("stops a review batch the same way, naming the first entry when nothing was done yet", async () => {
    const dir = await translated({ greeting: "Hello" });
    const fs: SdkFs = {
      ...defaultFs,
      writeFile: async (path, data) => {
        if (path.endsWith(PROVENANCE_FILE_NAME)) {
          throw new RangeError("unexpected");
        }
        await defaultFs.writeFile(path, data);
      },
    };

    const error = await approveEntries(
      {
        config: cfg(),
        cwd: dir,
        entries: [{ locale: "de", key: "greeting", expectedValue: "[de] Hello" }],
      },
      { fs },
    ).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(BatchInterruptedError);
    expect((error as BatchInterruptedError).results).toEqual([]);
    expect((error as Error).message).toContain("after 0 completed entries");
  });

  it.each([
    ["MISSING_API_KEY"],
    ["AUTH_FAILED"],
    ["RATE_LIMITED"],
    ["NETWORK_POLICY_VIOLATION"],
  ] as const)(
    "skips the rest of the batch after a %s provider error, without calling the provider again",
    async (code) => {
      const dir = await translated({ greeting: "Hello", farewell: "Bye", later: "Later" });
      const stub = makeStubProvider({
        throwForLocales: new Set(["de"]),
        error: new ProviderError(code, "no"),
      });

      const { results } = await retranslateEntries(
        {
          config: cfg(),
          cwd: dir,
          entries: [
            { locale: "de", key: "greeting" },
            { locale: "de", key: "farewell" },
            { locale: "de", key: "later" },
          ],
        },
        { createProvider: () => stub.provider },
      );

      expect(stub.calls).toHaveLength(1);
      expect(results[0]).toEqual({ locale: "de", key: "greeting", ok: false, code, message: "no" });
      expect(results.slice(1)).toEqual(
        ["farewell", "later"].map((key) => ({
          locale: "de",
          key,
          ok: false,
          skipped: true,
          code,
          message: `Not attempted: an earlier entry failed with ${code}, which would fail this one too.`,
        })),
      );
    },
  );

  it.each<[string, Partial<VerbatraConfig>, CreateProvider]>([
    ["MACHINE_TRANSLATION_DISABLED", { provider: { id: "none", options: {} } }, stubCreate],
    [
      "PROVIDER_CONSTRUCTION_FAILED",
      {},
      () => {
        throw new SdkError("PROVIDER_CONSTRUCTION_FAILED", "no key");
      },
    ],
  ])("skips the rest of the batch after %s", async (code, overrides, createProvider) => {
    const dir = await translated({ greeting: "Hello", farewell: "Bye" });

    const { results } = await retranslateEntries(
      {
        config: cfg(overrides),
        cwd: dir,
        entries: [
          { locale: "de", key: "greeting" },
          { locale: "de", key: "farewell" },
        ],
      },
      { createProvider },
    );

    expect(
      results.map((outcome) => [outcome.ok, "skipped" in outcome, outcome.ok ? "" : outcome.code]),
    ).toEqual([
      [false, false, code],
      [false, true, code],
    ]);
  });

  it("carries on after a provider error that concerns only one entry", async () => {
    const dir = await translated({ greeting: "Hello", farewell: "Bye" });
    const base = makeStubProvider();
    let calls = 0;
    const provider = {
      ...base.provider,
      translateBatch: async (request: Parameters<typeof base.provider.translateBatch>[0]) => {
        calls += 1;
        if (calls === 1) {
          throw new ProviderError("TIMEOUT", "slow");
        }
        return base.provider.translateBatch(request);
      },
    };

    const { results } = await retranslateEntries(
      {
        config: cfg(),
        cwd: dir,
        entries: [
          { locale: "de", key: "greeting" },
          { locale: "de", key: "farewell" },
        ],
      },
      { createProvider: () => provider },
    );

    expect(results.map((outcome) => outcome.ok)).toEqual([false, true]);
  });

  it("bounds each entry's wait for its locale lock and reports the wait", async () => {
    const dir = await translated({ greeting: "Hello" });
    const lock = localeLockPath(dir, "de");
    await mkdir(dirname(lock), { recursive: true });
    await writeFile(lock, JSON.stringify({ pid: 1, hostname: "another-machine" }), "utf8");
    const stub = makeStubProvider();
    const waits: string[] = [];

    const { results } = await retranslateEntries(
      {
        config: cfg(),
        cwd: dir,
        entries: [{ locale: "de", key: "greeting" }],
        lockAcquireTimeoutMs: 1_200,
        onLockWait: (event) => waits.push(event.lockPath),
      },
      { createProvider: () => stub.provider },
    );

    expect(results[0]).toMatchObject({ ok: false, code: "LOCK_CONTENDED" });
    expect(waits).toEqual([lock]);
    expect(stub.calls).toHaveLength(0);
  });
});

describe("entry batches: redaction", () => {
  function registryFailingOn(localeFile: string, message: string): AdapterRegistry {
    const resolution = createDefaultRegistry().resolve("en.json", { format: "i18next-json" });
    if (resolution.status !== "resolved") {
      throw new Error("the i18next adapter is not registered");
    }
    const adapter = resolution.adapter;
    return new AdapterRegistry().register({
      ...adapter,
      read: async (filePath, locale) => {
        if (filePath.endsWith(localeFile)) {
          throw new AdapterError("INVALID_JSON", message);
        }
        return adapter.read(filePath, locale);
      },
    });
  }

  it("redacts a key-shaped secret from an adapter error that reaches a result", async () => {
    const dir = await translated({ greeting: "Hello" });
    const secret = `sk-${"a1".repeat(24)}`;

    const { results } = await approveEntries(
      {
        config: cfg(),
        cwd: dir,
        entries: [{ locale: "de", key: "greeting", expectedValue: "[de] Hello" }],
      },
      { adapterRegistry: registryFailingOn("de.json", `bad file near ${secret}`) },
    );

    expect(results[0]).toMatchObject({ ok: false, code: "INVALID_JSON" });
    expect(JSON.stringify(results)).not.toContain(secret);
  });
});
