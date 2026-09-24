import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { ProviderError } from "@verbatra/ai-providers";
import { AdapterError, AdapterRegistry, createDefaultRegistry } from "@verbatra/format-adapters";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import { loadProvenance } from "../lock/load-provenance.js";
import type { CreateProvider } from "../selection/select-provider.js";
import {
  baseConfig,
  makeStubProvider,
  makeTempDir,
  readJsonFile,
  writeJsonFile,
} from "../test-support.js";
import { editEntry } from "./edit-entry.js";
import { approveEntries, rejectEntries, retranslateEntries } from "./entry-batch.js";
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

  it("throws an error that is not an outcome of one entry and stops the batch there", async () => {
    const dir = await translated({ greeting: "Hello", farewell: "Bye" });
    const stub = makeStubProvider({
      throwForLocales: new Set(["de"]),
      error: new TypeError("programming error"),
    });

    await expect(
      retranslateEntries(
        {
          config: cfg(),
          cwd: dir,
          entries: [
            { locale: "de", key: "greeting" },
            { locale: "de", key: "farewell" },
          ],
        },
        { createProvider: () => stub.provider },
      ),
    ).rejects.toThrow("programming error");
    expect(stub.calls).toHaveLength(1);
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
