import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CACHE_FILE_NAME } from "../cache/translation-memory.js";
import type { VerbatraConfig } from "../config/schema.js";
import { PROVENANCE_FILE_NAME } from "../lock/provenance-file.js";
import {
  baseConfig,
  makeStubProvider,
  makeTempDir,
  readJsonFile,
  readTextFile,
  writeJsonFile,
} from "../test-support.js";
import { check } from "./check.js";
import { diff } from "./diff.js";
import { editEntry } from "./edit-entry.js";
import { translate } from "./translate-project.js";

const cfg = (overrides: Partial<VerbatraConfig> = {}): VerbatraConfig =>
  baseConfig({ targetLocales: ["de"], ...overrides });

const SOURCE = { greeting: "Hello", farewell: "Bye" };
const CHANGED_SOURCE = { greeting: "Hello there", farewell: "Bye now" };

async function project(source: Record<string, unknown> = SOURCE): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), source);
  return dir;
}

async function translatedProject(): Promise<string> {
  const dir = await project();
  await translate(
    { config: cfg(), cwd: dir },
    { createProvider: () => makeStubProvider().provider },
  );
  return dir;
}

async function humanEditedProject(): Promise<string> {
  const dir = await translatedProject();
  await editEntry({ config: cfg(), cwd: dir, locale: "de", key: "greeting", value: "Hallo" });
  await writeJsonFile(join(dir, "locales", "en.json"), CHANGED_SOURCE);
  return dir;
}

async function rewriteRecord(
  dir: string,
  key: string,
  patch: Readonly<Record<string, string>>,
): Promise<void> {
  const path = join(dir, PROVENANCE_FILE_NAME);
  const file = (await readJsonFile(path)) as {
    locales: Record<string, Record<string, Record<string, string>>>;
  };
  const record = file.locales.de?.[key];
  if (record === undefined) {
    throw new Error(`no record for ${key}`);
  }
  Object.assign(record, patch);
  await writeJsonFile(path, file);
}

async function targetFile(dir: string): Promise<Record<string, string>> {
  return (await readJsonFile(join(dir, "locales", "de.json"))) as Record<string, string>;
}

function sentKeys(stub: ReturnType<typeof makeStubProvider>): string[] {
  return stub.calls.flatMap((call) => call.request.entries.map((entry) => entry.key)).sort();
}

describe("translate: protecting human translations", () => {
  it("keeps a human value whose source changed, leaves it stale, and translates the rest", async () => {
    const dir = await humanEditedProject();
    const stub = makeStubProvider();

    const summary = await translate(
      { config: cfg(), cwd: dir },
      { createProvider: () => stub.provider },
    );

    const locale = summary.locales[0];
    expect(locale?.protected).toEqual([{ key: "greeting", reason: "human" }]);
    expect(locale?.translated).toEqual(["farewell"]);
    expect(locale?.status).toBe("succeeded");
    expect(sentKeys(stub)).toEqual(["farewell"]);
    expect(await targetFile(dir)).toEqual({ greeting: "Hallo", farewell: "[de] Bye now" });

    const status = await check({ config: cfg(), cwd: dir });
    expect(status.locales[0]).toMatchObject({ stale: 1, protected: 1, inSync: false });
    const drift = await diff({ config: cfg(), cwd: dir });
    expect(drift.locales[0]).toMatchObject({ changed: ["greeting"], protected: ["greeting"] });
  });

  it("shows a protected key in a dry run instead of listing it as to translate", async () => {
    const dir = await humanEditedProject();
    const before = await readTextFile(join(dir, "locales", "de.json"));

    const summary = await translate({ config: cfg(), cwd: dir, dryRun: true });

    expect(summary.locales[0]?.protected).toEqual([{ key: "greeting", reason: "human" }]);
    expect(summary.locales[0]?.translated).toEqual(["farewell"]);
    expect(await readTextFile(join(dir, "locales", "de.json"))).toBe(before);
  });

  it("retranslates a human value under humanEdits overwrite, from the config or for one run", async () => {
    for (const run of [
      { config: cfg({ humanEdits: "overwrite" }) },
      { config: cfg(), humanEdits: "overwrite" as const },
    ]) {
      const dir = await humanEditedProject();
      const summary = await translate(
        { ...run, cwd: dir },
        { createProvider: () => makeStubProvider().provider },
      );
      expect(summary.locales[0]?.protected).toEqual([]);
      expect((await targetFile(dir)).greeting).toBe("[de] Hello there");
    }
  });

  it("protects an imported value and a value changed outside verbatra", async () => {
    const dir = await translatedProject();
    await rewriteRecord(dir, "greeting", { origin: "import" });
    const target = await targetFile(dir);
    await writeJsonFile(join(dir, "locales", "de.json"), { ...target, farewell: "Tschuess" });
    await writeJsonFile(join(dir, "locales", "en.json"), CHANGED_SOURCE);

    const summary = await translate({ config: cfg(), cwd: dir, dryRun: true });

    expect(summary.locales[0]?.protected).toEqual([
      { key: "farewell", reason: "external" },
      { key: "greeting", reason: "import" },
    ]);
  });

  it.each([
    ["an agent", { origin: "agent" }],
    ["a machine", { origin: "machine" }],
    ["a rejected human", { origin: "human", reviewState: "rejected" }],
  ])("does not protect %s value", async (_label, patch) => {
    const dir = await translatedProject();
    await rewriteRecord(dir, "greeting", patch);
    await writeJsonFile(join(dir, "locales", "en.json"), CHANGED_SOURCE);

    const summary = await translate({ config: cfg(), cwd: dir, dryRun: true });

    expect(summary.locales[0]?.protected).toEqual([]);
    expect(summary.locales[0]?.translated).toEqual(["farewell", "greeting"]);
  });

  it("does not protect a value with no record, so a project adopted before provenance keeps translating", async () => {
    const dir = await translatedProject();
    await writeFile(join(dir, PROVENANCE_FILE_NAME), '{"version":1,"locales":{}}\n', "utf8");
    await writeJsonFile(join(dir, "locales", "en.json"), CHANGED_SOURCE);

    const summary = await translate({ config: cfg(), cwd: dir, dryRun: true });

    expect(summary.locales[0]?.protected).toEqual([]);
  });

  it("protects every stale value when the provenance file is from a newer verbatra", async () => {
    const dir = await translatedProject();
    await writeFile(join(dir, PROVENANCE_FILE_NAME), '{"version":9,"locales":{}}', "utf8");
    await writeJsonFile(join(dir, "locales", "en.json"), { ...CHANGED_SOURCE, extra: "More" });

    const summary = await translate({ config: cfg(), cwd: dir, dryRun: true });

    expect(summary.locales[0]?.protected).toEqual([
      { key: "farewell", reason: "external" },
      { key: "greeting", reason: "external" },
    ]);
    expect(summary.locales[0]?.translated).toEqual(["extra"]);
    const drift = await diff({ config: cfg(), cwd: dir });
    expect(drift.locales[0]?.protected).toEqual([]);
  });

  it("fails a dry run on a corrupt provenance file unless protection is off", async () => {
    const dir = await translatedProject();
    await writeFile(join(dir, PROVENANCE_FILE_NAME), "{not json", "utf8");

    await expect(translate({ config: cfg(), cwd: dir, dryRun: true })).rejects.toMatchObject({
      code: "PROVENANCE_FILE_INVALID",
    });
    const summary = await translate({
      config: cfg({ humanEdits: "overwrite" }),
      cwd: dir,
      dryRun: true,
    });
    expect(summary.locales[0]?.status).toBe("succeeded");
  });
});

describe("translate: humanEdits suggest", () => {
  it("returns a suggestion without writing it and serves it from the memory on the next run", async () => {
    const dir = await humanEditedProject();
    const stub = makeStubProvider();
    const config = cfg({ humanEdits: "suggest" });

    const first = await translate({ config, cwd: dir }, { createProvider: () => stub.provider });

    expect(first.locales[0]?.protected).toEqual([
      {
        key: "greeting",
        reason: "human",
        suggestion: "[de] Hello there",
        suggestionStatus: "suggested",
      },
    ]);
    expect(first.locales[0]?.translated).toEqual(["farewell"]);
    expect(sentKeys(stub)).toEqual(["farewell", "greeting"]);
    expect((await targetFile(dir)).greeting).toBe("Hallo");
    expect(await readTextFile(join(dir, CACHE_FILE_NAME))).toContain("[de] Hello there");

    const again = makeStubProvider();
    const second = await translate({ config, cwd: dir }, { createProvider: () => again.provider });

    expect(again.calls).toHaveLength(0);
    expect(second.locales[0]?.protected).toEqual([
      {
        key: "greeting",
        reason: "human",
        suggestion: "[de] Hello there",
        suggestionStatus: "suggested",
      },
    ]);
    expect(second.locales[0]?.cacheHits).toEqual([]);
    expect((await check({ config, cwd: dir })).locales[0]?.stale).toBe(1);
  });

  it("reports a failed suggestion without a value and without failing the locale", async () => {
    const dir = await humanEditedProject();
    const summary = await translate(
      { config: cfg({ humanEdits: "suggest" }), cwd: dir, cache: false },
      {
        createProvider: () => makeStubProvider({ missingValues: new Set(["greeting"]) }).provider,
      },
    );

    expect(summary.locales[0]?.protected).toEqual([
      { key: "greeting", reason: "human", suggestionStatus: "provider-failure" },
    ]);
    expect(summary.locales[0]?.providerFailures).toEqual([]);
    expect(summary.locales[0]?.status).toBe("succeeded");
  });

  it("counts the keys it would send for a suggestion in a dry-run estimate", async () => {
    const dir = await humanEditedProject();

    const protect = await translate({ config: cfg(), cwd: dir, estimate: true });
    const suggest = await translate({
      config: cfg({ humanEdits: "suggest" }),
      cwd: dir,
      estimate: true,
    });

    expect(protect.estimate?.locales[0]?.keys).toBe(1);
    expect(suggest.estimate?.locales[0]?.keys).toBe(2);
    expect(suggest.locales[0]?.translated).toEqual(["farewell"]);
  });

  it("does not send a protected key whose source is invalid ICU", async () => {
    const config = cfg({ format: "next-intl-json", humanEdits: "suggest" });
    const dir = await project();
    await translate({ config, cwd: dir }, { createProvider: () => makeStubProvider().provider });
    await editEntry({ config, cwd: dir, locale: "de", key: "greeting", value: "Hallo" });
    await writeJsonFile(join(dir, "locales", "en.json"), {
      ...CHANGED_SOURCE,
      greeting: "{count, plural, one {x}",
    });
    const stub = makeStubProvider();

    const summary = await translate({ config, cwd: dir }, { createProvider: () => stub.provider });

    expect(sentKeys(stub)).toEqual(["farewell"]);
    expect(summary.locales[0]?.protected).toEqual([{ key: "greeting", reason: "human" }]);
    expect(summary.locales[0]?.invalidIcuSource).toEqual(["greeting"]);
    const estimated = await translate({ config, cwd: dir, estimate: true });
    expect(estimated.estimate?.locales[0]?.keys).toBe(0);
    expect(estimated.locales[0]?.protected).toEqual([{ key: "greeting", reason: "human" }]);
  });
});

describe("translate: pinnedKeys", () => {
  it("never sends a pinned key, missing or stale, whatever humanEdits says", async () => {
    for (const humanEdits of ["protect", "suggest", "overwrite"] as const) {
      const dir = await translatedProject();
      await writeJsonFile(join(dir, "locales", "en.json"), {
        ...CHANGED_SOURCE,
        legal: { terms: "Terms" },
      });
      const stub = makeStubProvider();
      const config = cfg({ humanEdits, pinnedKeys: ["legal.*", "greeting"] });

      const summary = await translate(
        { config, cwd: dir },
        { createProvider: () => stub.provider },
      );

      expect(sentKeys(stub)).toEqual(["farewell"]);
      expect(summary.locales[0]?.protected).toEqual([
        { key: "greeting", reason: "pinned" },
        { key: "legal.terms", reason: "pinned" },
      ]);
      const drift = await diff({ config, cwd: dir });
      expect(drift.locales[0]?.protected).toEqual(["greeting", "legal.terms"]);
    }
  });

  it("counts only a present pinned key in the protected share of check's stale count", async () => {
    const dir = await translatedProject();
    await writeJsonFile(join(dir, "locales", "en.json"), {
      ...CHANGED_SOURCE,
      legal: { terms: "Terms" },
    });
    const config = cfg({ pinnedKeys: ["legal.*", "greeting"] });

    const status = await check({ config, cwd: dir });

    expect(status.locales[0]).toMatchObject({ missing: 1, stale: 2, protected: 1 });
  });

  it("does not generate plural forms for a pinned key", async () => {
    const dir = await project({ items_one: "{{count}} item", items_other: "{{count}} items" });
    const config = cfg({
      targetLocales: ["ru"],
      generatePlurals: true,
      pinnedKeys: ["items_*"],
    });

    const planned = await translate({ config, cwd: dir, dryRun: true });
    const stub = makeStubProvider();
    const live = await translate({ config, cwd: dir }, { createProvider: () => stub.provider });

    expect(planned.locales[0]?.generated).toEqual([]);
    expect(planned.locales[0]?.protected.map((entry) => entry.key)).toEqual([
      "items_few",
      "items_many",
      "items_one",
      "items_other",
    ]);
    expect(stub.calls).toHaveLength(0);
    expect(live.locales[0]?.generated).toEqual([]);
  });
});

describe("translate: protection in human-only mode", () => {
  it("reports a protected key as protected rather than unfilled, and never fills it", async () => {
    const dir = await humanEditedProject();
    const config = cfg({ provider: { id: "none", options: {} }, humanEdits: "suggest" });

    const summary = await translate({ config, cwd: dir });

    expect(summary.locales[0]?.protected).toEqual([{ key: "greeting", reason: "human" }]);
    expect(summary.locales[0]?.unfilled).not.toContain("greeting");
    expect((await targetFile(dir)).greeting).toBe("Hallo");
  });
});

describe("translate: protection edge cases", () => {
  it.each([
    ["the representative", "a"],
    ["the duplicate", "b"],
  ])("keeps a protected key when it is %s of a content-duplicate group", async (_label, human) => {
    for (const humanEdits of ["protect", "suggest"] as const) {
      const dir = await project({ a: "Same", b: "Same" });
      await translate(
        { config: cfg(), cwd: dir },
        { createProvider: () => makeStubProvider().provider },
      );
      await editEntry({ config: cfg(), cwd: dir, locale: "de", key: human, value: "Von Hand" });
      await writeJsonFile(join(dir, "locales", "en.json"), { a: "Same again", b: "Same again" });
      const other = human === "a" ? "b" : "a";

      const summary = await translate(
        { config: cfg({ humanEdits }), cwd: dir },
        { createProvider: () => makeStubProvider().provider },
      );

      const target = await targetFile(dir);
      expect(target[human]).toBe("Von Hand");
      expect(target[other]).toBe("[de] Same again");
      expect(summary.locales[0]?.protected.map((entry) => entry.key)).toEqual([human]);
      expect(summary.locales[0]?.protected[0]?.suggestion).toBe(
        humanEdits === "suggest" ? "[de] Same again" : undefined,
      );
    }
  });

  it("reports a suggestion refused by the integrity gate", async () => {
    const dir = await humanEditedProject();

    const summary = await translate(
      { config: cfg({ humanEdits: "suggest" }), cwd: dir, cache: false },
      {
        createProvider: () => makeStubProvider({ failIntegrity: new Set(["greeting"]) }).provider,
      },
    );

    expect(summary.locales[0]?.protected).toEqual([
      { key: "greeting", reason: "human", suggestionStatus: "integrity-mismatch" },
    ]);
    expect(summary.locales[0]?.integrityMismatches).toEqual([]);
  });

  it("reports a suggestion the token budget withheld, without failing the locale", async () => {
    const dir = await translatedProject();
    await editEntry({ config: cfg(), cwd: dir, locale: "de", key: "greeting", value: "Hallo" });
    await writeJsonFile(join(dir, "locales", "en.json"), { ...SOURCE, greeting: "Hello there" });

    const summary = await translate(
      {
        config: cfg({ humanEdits: "suggest", maxTokens: 1, budgetBehavior: "stop" }),
        cwd: dir,
        cache: false,
      },
      { createProvider: () => makeStubProvider().provider },
    );

    expect(summary.locales[0]?.protected).toEqual([
      { key: "greeting", reason: "human", suggestionStatus: "budget-withheld" },
    ]);
    expect(summary.locales[0]?.budgetWithheld).toEqual([]);
    expect(summary.locales[0]?.status).toBe("succeeded");
  });

  it("never offers a fuzzy memory match as a suggestion, and asks the provider instead", async () => {
    const config = cfg({ humanEdits: "suggest", fuzzyCache: { enabled: true, threshold: 0.5 } });
    const dir = await translatedProject();
    await editEntry({ config, cwd: dir, locale: "de", key: "greeting", value: "Hallo" });
    await writeJsonFile(join(dir, "locales", "en.json"), { ...SOURCE, greeting: "Hello!" });
    const stub = makeStubProvider();

    const summary = await translate({ config, cwd: dir }, { createProvider: () => stub.provider });

    expect(sentKeys(stub)).toEqual(["greeting"]);
    expect(summary.locales[0]?.fuzzyHits).toEqual([]);
    expect(summary.locales[0]?.protected[0]?.suggestion).toBe("[de] Hello!");
  });
});

describe("translate: protection and generated plural forms", () => {
  const pluralConfig = (overrides: Partial<VerbatraConfig> = {}): VerbatraConfig =>
    cfg({ targetLocales: ["ru"], generatePlurals: true, ...overrides });
  const PLURAL_SOURCE = { items_one: "{{count}} item", items_other: "{{count}} items" };

  async function generatedProject(): Promise<string> {
    const dir = await project(PLURAL_SOURCE);
    await translate(
      { config: pluralConfig(), cwd: dir },
      { createProvider: () => makeStubProvider().provider },
    );
    return dir;
  }

  async function ruFile(dir: string): Promise<Record<string, string>> {
    return (await readJsonFile(join(dir, "locales", "ru.json"))) as Record<string, string>;
  }

  it("holds a generated form a translator edited, while regenerating the rest", async () => {
    const dir = await generatedProject();
    const before = await ruFile(dir);
    expect(before.items_few).toBeDefined();
    await writeJsonFile(join(dir, "locales", "ru.json"), { ...before, items_few: "{{count}} X" });
    await writeJsonFile(join(dir, "locales", "en.json"), {
      ...PLURAL_SOURCE,
      items_other: "{{count}} things",
    });

    const summary = await translate(
      { config: pluralConfig(), cwd: dir },
      { createProvider: () => makeStubProvider().provider },
    );

    expect((await ruFile(dir)).items_few).toBe("{{count}} X");
    expect(summary.locales[0]?.protected).toContainEqual({ key: "items_few", reason: "external" });
    expect(summary.locales[0]?.generated).not.toContain("items_few");
  });

  it("holds every generated form of a protected base form, so a plural set is never mixed", async () => {
    const dir = await generatedProject();
    const before = await ruFile(dir);
    await editEntry({
      config: pluralConfig(),
      cwd: dir,
      locale: "ru",
      key: "items_other",
      value: "{{count}} vesch",
    });
    await writeJsonFile(join(dir, "locales", "en.json"), {
      ...PLURAL_SOURCE,
      items_other: "{{count}} things",
    });
    const stub = makeStubProvider();

    const summary = await translate(
      { config: pluralConfig(), cwd: dir },
      { createProvider: () => stub.provider },
    );

    const after = await ruFile(dir);
    expect(after.items_other).toBe("{{count}} vesch");
    expect(after.items_few).toBe(before.items_few);
    expect(after.items_many).toBe(before.items_many);
    expect(summary.locales[0]?.generated).toEqual([]);
    expect(summary.locales[0]?.protected).toEqual([
      { key: "items_few", reason: "human" },
      { key: "items_many", reason: "human" },
      { key: "items_other", reason: "human" },
    ]);
  });
});
