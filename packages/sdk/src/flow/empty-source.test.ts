import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { contentHash } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import {
  baseConfig,
  makeStubProvider,
  makeTempDir,
  readJsonFile,
  writeJsonFile,
} from "../test-support.js";
import { type WatchRunResult, watch } from "../watch/watch.js";
import { check } from "./check.js";
import { diff } from "./diff.js";
import { emptySourceNotice } from "./empty-source.js";
import { keyIntegrity } from "./key-integrity.js";
import { lockState } from "./lock-state.js";
import type { RunSummary } from "./summary.js";
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

  it("keeps every lock entry in lockState and counts the key in emptySource only", async () => {
    const dir = await translatedThenBlanked();

    const state = await lockState({ config: cfg(), cwd: dir });

    expect(state).toEqual({
      exists: true,
      version: expect.any(Number),
      locales: [
        expect.objectContaining({
          locale: "de",
          keyCount: 2,
          missing: 0,
          stale: 0,
          upToDate: 1,
          emptySource: 1,
        }),
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

function sentKeys(stub: ReturnType<typeof makeStubProvider>): readonly string[] {
  return stub.calls.flatMap((call) => call.request.entries.map((entry) => entry.key)).sort();
}

describe("a key 0.11 translated from an empty source", () => {
  async function translatedFromEmpty(): Promise<string> {
    const dir = await project(
      { greeting: "Hello", empty: "" },
      { de: { greeting: "Hallo", empty: "" } },
    );
    await writeJsonFile(join(dir, "verbatra.lock.json"), {
      version: 1,
      locales: {
        de: {
          greeting: contentHash({
            key: "greeting",
            namespace: "",
            value: "Hello",
            placeholders: [],
            isPlural: false,
          }),
          empty: contentHash({
            key: "empty",
            namespace: "",
            value: "",
            placeholders: [],
            isPlural: false,
          }),
        },
      },
    });
    return dir;
  }

  it("is reported by the notice and counted in emptySource, never as up to date", async () => {
    const dir = await translatedFromEmpty();

    const summary = await translate({ config: cfg(), cwd: dir, dryRun: true });
    const checked = await check({ config: cfg(), cwd: dir });
    const state = await lockState({ config: cfg(), cwd: dir });

    expect(summary.locales[0]?.emptySource).toEqual(["empty"]);
    expect(summary.locales[0]?.unchanged).not.toContain("empty");
    expect(summary.locales[0]?.notices.map((notice) => notice.code)).toContain(
      "SOURCE_VALUE_EMPTY",
    );
    expect(checked.locales[0]).toMatchObject({ emptySource: 1, inSync: true });
    expect(state).toMatchObject({ locales: [{ emptySource: 1, keyCount: 2 }] });
  });
});

describe("the summary of a run", () => {
  it("lists the keys with an empty source value in emptySource", async () => {
    const dir = await project({ greeting: "Hello", b: "", a: " " });
    const stub = makeStubProvider();

    const summary = await translate(
      { config: cfg(), cwd: dir },
      { createProvider: () => stub.provider },
    );

    expect(summary.locales[0]?.emptySource).toEqual(["a", "b"]);
  });

  it("estimates and budgets exactly as if the empty key were absent", async () => {
    const plain = await project({ greeting: "Hello world" });
    const withEmpty = await project({ greeting: "Hello world", empty: "", blank: "  " });

    const expected = await translate({ config: cfg(), cwd: plain, estimate: true });
    const actual = await translate({ config: cfg(), cwd: withEmpty, estimate: true });

    expect(actual.estimate).toEqual(expected.estimate);
    const total = (expected.estimate?.inputTokens ?? 0) + (expected.estimate?.outputTokens ?? 0);
    expect(total).toBeGreaterThan(0);

    const stub = makeStubProvider({ usage: { inputTokens: 1, outputTokens: 1 } });
    const run = await translate(
      { config: cfg({ maxTokens: total, budgetBehavior: "stop" }), cwd: withEmpty },
      { createProvider: () => stub.provider },
    );
    expect(run.locales[0]?.budgetWithheld).toEqual([]);
    expect(run.locales[0]?.translated).toEqual(["greeting"]);
  });
});

describe("a plural with a blank source form", () => {
  const source = { items_one: "", items_other: "{{count}} items" };

  it("sends only the filled form without plural generation", async () => {
    const dir = await project(source);
    const stub = makeStubProvider();

    const summary = await translate(
      { config: cfg({ targetLocales: ["fr"] }), cwd: dir },
      { createProvider: () => stub.provider },
    );

    expect(sentKeys(stub)).toEqual(["items_other"]);
    expect(summary.locales[0]?.emptySource).toEqual(["items_one"]);
  });

  it("generates the missing categories from the filled form, never from the blank one", async () => {
    const dir = await project(source);
    const stub = makeStubProvider();

    const summary = await translate(
      { config: cfg({ targetLocales: ["fr"], generatePlurals: true }), cwd: dir },
      { createProvider: () => stub.provider },
    );

    expect(sentKeys(stub)).not.toContain("items_one");
    expect(summary.locales[0]?.generated).toEqual(["items_many"]);
    const fr = (await readJsonFile(join(dir, "locales", "fr.json"))) as Record<string, string>;
    expect(fr.items_many).toBe("[fr] {{count}} items");
    expect(fr.items_one).toBeUndefined();
  });
});

describe("an empty source value in other formats", () => {
  it("is skipped for an empty ICU message in next-intl", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, "messages"));
    await writeJsonFile(join(dir, "messages", "en.json"), { a: "Hi {name}", b: "" });
    const config = cfg({ format: "next-intl-json", files: { pattern: "messages/{locale}.json" } });
    const stub = makeStubProvider();

    const summary = await translate({ config, cwd: dir }, { createProvider: () => stub.provider });

    expect(sentKeys(stub)).toEqual(["a"]);
    expect(summary.locales[0]?.emptySource).toEqual(["b"]);
  });

  it("is skipped for a gettext entry whose source msgstr is empty", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, "locales"));
    await writeFile(
      join(dir, "locales", "en.po"),
      [
        'msgid ""',
        'msgstr ""',
        '"Content-Type: text/plain; charset=UTF-8\\n"',
        "",
        'msgid "greeting"',
        'msgstr "Hello"',
        "",
        'msgid "empty"',
        'msgstr ""',
        "",
      ].join("\n"),
      "utf8",
    );
    const config = cfg({ format: "gettext-po", files: { pattern: "locales/{locale}.po" } });

    const summary = await diff({ config, cwd: dir });

    expect(summary.locales[0]).toMatchObject({ missing: ["greeting"], emptySource: ["empty"] });
  });

  it("is skipped for an xcstrings string whose source value is empty", async () => {
    const dir = await makeTempDir();
    const unit = (value: string) => ({
      localizations: { en: { stringUnit: { state: "translated", value } } },
    });
    await writeJsonFile(join(dir, "Localizable.xcstrings"), {
      sourceLanguage: "en",
      strings: { empty: unit(""), greeting: unit("Hello") },
      version: "1.0",
    });
    const config = cfg({
      format: "apple-xcstrings",
      files: { pattern: "Localizable{locale}.xcstrings" },
    });

    const summary = await diff({ config, cwd: dir });

    expect(summary.locales[0]).toMatchObject({ missing: ["greeting"], emptySource: ["empty"] });
  });
});

describe("watch", () => {
  it("raises the notice on each run and sends nothing for the empty key", async () => {
    const dir = await project({ greeting: "Hello", empty: "" });
    const stub = makeStubProvider();
    const runs: WatchRunResult[] = [];

    const controller = await watch(
      { config: cfg(), cwd: dir, onRun: (result) => runs.push(result) },
      {
        createProvider: () => stub.provider,
        createWatcher: () => ({ onChange: () => {}, close: async () => {} }),
      },
    );
    await controller.stop();

    const summary: RunSummary | undefined =
      runs[0]?.status === "succeeded" ? runs[0].summary : undefined;
    expect(summary?.locales[0]?.notices.map((notice) => notice.code)).toContain(
      "SOURCE_VALUE_EMPTY",
    );
    expect(sentKeys(stub)).toEqual(["greeting"]);
  });
});
