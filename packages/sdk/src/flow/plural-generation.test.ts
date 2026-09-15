import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  PlaceholderComparator,
  TranslateRequest,
  TranslateResult,
  TranslationProvider,
} from "@verbatra/ai-providers";
import type { LocaleResource, PlaceholderIntegrityResult, TranslationEntry } from "@verbatra/core";
import type { FormatAdapter } from "@verbatra/format-adapters";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import {
  baseConfig,
  makeIntegrityProvider,
  makeStubProvider,
  makeTempDir,
  readJsonFile,
  readTextFile,
  writeJsonFile,
} from "../test-support.js";
import { createBudgetTracker } from "./budget.js";
import { generatePluralForms, type PluralGenerationContext } from "./plural-generation.js";
import { translate } from "./translate-project.js";

async function project(
  source: Record<string, unknown>,
  targets: Record<string, Record<string, unknown> | undefined>,
): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), source);
  for (const [locale, obj] of Object.entries(targets)) {
    if (obj !== undefined) {
      await writeJsonFile(join(dir, "locales", `${locale}.json`), obj);
    }
  }
  return dir;
}

function targetPath(dir: string, locale: string): string {
  return join(dir, "locales", `${locale}.json`);
}

function lockPath(dir: string): string {
  return join(dir, "verbatra.lock.json");
}

type LockShape = { locales: Record<string, Record<string, string>> };

const cfg = (overrides: Partial<VerbatraConfig> = {}): VerbatraConfig =>
  baseConfig({ targetLocales: ["pl"], ...overrides });

const PLURAL_SOURCE = { items_one: "{{count}} item", items_other: "{{count}} items" };

function hasNotice(notices: readonly { code: string }[]): boolean {
  return notices.some((n) => n.code === "PLURAL_CATEGORIES_INCOMPLETE");
}

describe("translate: plural-category generation (supported case)", () => {
  it("generates every required category for a richer target and clears the warning", async () => {
    const dir = await project(PLURAL_SOURCE, { pl: {} });

    const summary = await translate(
      { config: cfg(), cwd: dir, generatePlurals: true },
      { createProvider: () => makeStubProvider().provider },
    );

    const pl = (await readJsonFile(targetPath(dir, "pl"))) as Record<string, string>;
    expect(pl.items_one).toBeDefined();
    expect(pl.items_other).toBeDefined();
    expect(pl.items_few).toBeDefined();
    expect(pl.items_many).toBeDefined();

    const locale = summary.locales[0];
    expect(locale?.generated).toEqual(["items_few", "items_many"]);
    expect(locale?.translated).toEqual(["items_one", "items_other"]);
    expect(hasNotice(locale?.notices ?? [])).toBe(false);
  });

  it("generated forms carry the source placeholder set; a mismatch is withheld and the warning remains", async () => {
    const dir = await project(PLURAL_SOURCE, { pl: {} });

    const summary = await translate(
      { config: cfg(), cwd: dir, generatePlurals: true },
      {
        createProvider: () => makeStubProvider({ failIntegrity: new Set(["items_few"]) }).provider,
      },
    );

    const pl = (await readJsonFile(targetPath(dir, "pl"))) as Record<string, string>;
    expect(pl.items_few).toBeUndefined();
    expect(pl.items_many).toBeDefined();

    const locale = summary.locales[0];
    expect(locale?.generated).toEqual(["items_many"]);
    expect(locale?.integrityMismatches).toEqual(["items_few"]);
    expect(hasNotice(locale?.notices ?? [])).toBe(true);
  });

  it("withholds a generated form the provider returned empty, and keeps the warning", async () => {
    const dir = await project({ items_one: "one item", items_other: "many items" }, { pl: {} });
    const blankGenerated = makeStubProvider({
      translate: (value, key, locale) =>
        key === "items_few" || key === "items_many" ? "" : `[${locale}] ${value}`,
    });

    const summary = await translate(
      { config: cfg(), cwd: dir, generatePlurals: true },
      { createProvider: () => blankGenerated.provider },
    );

    const pl = (await readJsonFile(targetPath(dir, "pl"))) as Record<string, string>;
    expect(pl.items_few).toBeUndefined();
    expect(pl.items_many).toBeUndefined();
    expect(pl.items_one).toBe("[pl] one item");

    const locale = summary.locales[0];
    expect(locale?.generated).toEqual([]);
    expect([...(locale?.integrityMismatches ?? [])].sort()).toEqual(["items_few", "items_many"]);
    expect(hasNotice(locale?.notices ?? [])).toBe(true);
  });

  it("withholds a generated key still missing from the response under providerFailures, not integrityMismatches", async () => {
    const dir = await project(PLURAL_SOURCE, { pl: {} });

    const summary = await translate(
      { config: cfg(), cwd: dir, generatePlurals: true },
      {
        createProvider: () => makeStubProvider({ missingValues: new Set(["items_few"]) }).provider,
      },
    );

    const pl = (await readJsonFile(targetPath(dir, "pl"))) as Record<string, string>;
    expect(pl.items_few).toBeUndefined();

    const locale = summary.locales[0];
    expect(locale?.providerFailures).toContain("items_few");
    expect(locale?.integrityMismatches).not.toContain("items_few");
  });
});

describe("translate: divergent source placeholders across plural categories", () => {
  const DIVERGENT = { items_one: "{{count}} {{unit}}", items_other: "{{count}} items" };
  const SEEDED_TARGET = { items_one: "{{count}} sztuka", items_other: "{{count}} sztuk" };

  it("validates a generated form against the _other representative set and writes a matching form", async () => {
    const dir = await project(DIVERGENT, { pl: SEEDED_TARGET });

    const summary = await translate(
      { config: cfg(), cwd: dir, generatePlurals: true },
      { createProvider: () => makeIntegrityProvider((value) => `[pl] ${value}`) },
    );

    const pl = (await readJsonFile(targetPath(dir, "pl"))) as Record<string, string>;
    expect(pl.items_few).toContain("{{count}}");
    expect(pl.items_few).not.toContain("{{unit}}");
    expect(summary.locales[0]?.generated).toEqual(["items_few", "items_many"]);
    expect(summary.locales[0]?.translated).toEqual([]);
    expect(summary.locales[0]?.integrityMismatches).toEqual([]);
  });

  it("withholds a generated form whose placeholders match items_one but not the items_other representative", async () => {
    const dir = await project(DIVERGENT, { pl: SEEDED_TARGET });

    const summary = await translate(
      { config: cfg(), cwd: dir, generatePlurals: true },
      { createProvider: () => makeIntegrityProvider((value) => `[pl] ${value} {{unit}}`) },
    );

    const pl = (await readJsonFile(targetPath(dir, "pl"))) as Record<string, string>;
    expect(pl.items_few).toBeUndefined();
    expect(pl.items_many).toBeUndefined();
    expect(pl.items_one).toBe("{{count}} sztuka");
    expect(pl.items_other).toBe("{{count}} sztuk");
    expect(summary.locales[0]?.generated).toEqual([]);
    expect(summary.locales[0]?.translated).toEqual([]);
    expect(summary.locales[0]?.integrityMismatches).toEqual(["items_few", "items_many"]);
    expect(hasNotice(summary.locales[0]?.notices ?? [])).toBe(true);
  });
});

describe("translate: reordered placeholders in a generated plural form", () => {
  const REORDER_SOURCE = { items_one: "{{count}} {{unit}}", items_other: "{{count}} {{unit}}" };
  const REORDER_SEEDED = {
    items_one: "{{count}} {{unit}} eins",
    items_other: "{{count}} {{unit}} andere",
  };

  it("accepts and writes a generated form that reorders the representative placeholder multiset", async () => {
    const dir = await project(REORDER_SOURCE, { pl: REORDER_SEEDED });

    const summary = await translate(
      { config: cfg(), cwd: dir, generatePlurals: true },
      {
        createProvider: () =>
          makeIntegrityProvider((value) =>
            value.replace("{{count}} {{unit}}", "{{unit}} {{count}}"),
          ),
      },
    );

    const pl = (await readJsonFile(targetPath(dir, "pl"))) as Record<string, string>;
    expect(pl.items_few).toBe("{{unit}} {{count}}");
    expect(pl.items_many).toBe("{{unit}} {{count}}");
    expect(summary.locales[0]?.generated).toEqual(["items_few", "items_many"]);
    expect(summary.locales[0]?.integrityMismatches).toEqual([]);
    expect(hasNotice(summary.locales[0]?.notices ?? [])).toBe(false);
  });
});

describe("translate: multiple plural base keys, mixed completeness", () => {
  it("warns and generates only for the incomplete base key, leaving the complete one untouched", async () => {
    const source = {
      done_one: "{{count}} done",
      done_few: "{{count}} done (few)",
      done_many: "{{count}} done (many)",
      done_other: "{{count}} done (other)",
      items_one: "{{count}} item",
      items_other: "{{count}} items",
    };
    const dir = await project(source, { pl: {} });

    const summary = await translate(
      { config: cfg(), cwd: dir, generatePlurals: true },
      { createProvider: () => makeStubProvider().provider },
    );

    expect(summary.locales[0]?.generated).toEqual(["items_few", "items_many"]);
    const pl = (await readJsonFile(targetPath(dir, "pl"))) as Record<string, string>;
    expect(pl.done_few).toBeDefined();
    expect(pl.items_few).toBeDefined();
    expect(hasNotice(summary.locales[0]?.notices ?? [])).toBe(false);
  });

  it("keeps the warning when one base stays incomplete even though another is complete", async () => {
    const source = {
      done_one: "{{count}} done",
      done_few: "{{count}} done (few)",
      done_many: "{{count}} done (many)",
      done_other: "{{count}} done (other)",
      items_one: "{{count}} item",
      items_other: "{{count}} items",
    };
    const dir = await project(source, { pl: {} });

    const summary = await translate(
      { config: cfg(), cwd: dir, generatePlurals: true },
      {
        createProvider: () => makeStubProvider({ failIntegrity: new Set(["items_few"]) }).provider,
      },
    );

    expect(summary.locales[0]?.generated).toEqual(["items_many"]);
    expect(summary.locales[0]?.integrityMismatches).toEqual(["items_few"]);
    expect(hasNotice(summary.locales[0]?.notices ?? [])).toBe(true);
  });
});

describe("translate: a language needing more than two missing categories (Arabic)", () => {
  it("generates each missing category with a mix of pass and withhold", async () => {
    const dir = await project(PLURAL_SOURCE, { ar: {} });

    const summary = await translate(
      { config: cfg({ targetLocales: ["ar"] }), cwd: dir, generatePlurals: true },
      {
        createProvider: () =>
          makeStubProvider({ failIntegrity: new Set(["items_two", "items_many"]) }).provider,
      },
    );

    const ar = (await readJsonFile(targetPath(dir, "ar"))) as Record<string, string>;
    expect(ar.items_zero).toBeDefined();
    expect(ar.items_few).toBeDefined();
    expect(ar.items_two).toBeUndefined();
    expect(ar.items_many).toBeUndefined();

    const locale = summary.locales[0];
    expect(locale?.generated).toEqual(["items_few", "items_zero"]);
    expect(locale?.integrityMismatches).toEqual(["items_many", "items_two"]);
    expect(hasNotice(locale?.notices ?? [])).toBe(true);
  });

  it("generates the full missing set for Arabic when all forms pass", async () => {
    const dir = await project(PLURAL_SOURCE, { ar: {} });

    const summary = await translate(
      { config: cfg({ targetLocales: ["ar"] }), cwd: dir, generatePlurals: true },
      { createProvider: () => makeStubProvider().provider },
    );

    const locale = summary.locales[0];
    expect(locale?.generated).toEqual(["items_few", "items_many", "items_two", "items_zero"]);
    expect(hasNotice(locale?.notices ?? [])).toBe(false);
  });
});

describe("translate: plural generation fallbacks (never a hard failure)", () => {
  it("DeepL provider: no generation, run succeeds, warning emitted", async () => {
    const dir = await project(PLURAL_SOURCE, { pl: {} });

    const summary = await translate(
      {
        config: cfg({ provider: { id: "deepl", options: {} } }),
        cwd: dir,
        generatePlurals: true,
      },
      {
        createProvider: () =>
          makeStubProvider({ id: "deepl", kind: "machine-translation" }).provider,
      },
    );

    const pl = (await readJsonFile(targetPath(dir, "pl"))) as Record<string, string>;
    expect(pl.items_few).toBeUndefined();
    expect(summary.locales[0]?.status).toBe("succeeded");
    expect(summary.locales[0]?.generated).toEqual([]);
    expect(hasNotice(summary.locales[0]?.notices ?? [])).toBe(true);
  });

  it("non-i18next format: generation is a no-op, run succeeds, no notice", async () => {
    const dir = await project(PLURAL_SOURCE, { pl: {} });

    const summary = await translate(
      { config: cfg({ format: "vue-i18n-json" }), cwd: dir, generatePlurals: true },
      { createProvider: () => makeStubProvider().provider },
    );

    expect(summary.locales[0]?.status).toBe("succeeded");
    expect(summary.locales[0]?.generated).toEqual([]);
    expect(hasNotice(summary.locales[0]?.notices ?? [])).toBe(false);
  });

  it("unknown language: no generation, treated as {one, other}, run succeeds, no notice", async () => {
    const dir = await project(PLURAL_SOURCE, { xx: {} });

    const summary = await translate(
      { config: cfg({ targetLocales: ["xx"] }), cwd: dir, generatePlurals: true },
      { createProvider: () => makeStubProvider().provider },
    );

    const xx = (await readJsonFile(targetPath(dir, "xx"))) as Record<string, string>;
    expect(xx.items_few).toBeUndefined();
    expect(summary.locales[0]?.status).toBe("succeeded");
    expect(summary.locales[0]?.generated).toEqual([]);
    expect(hasNotice(summary.locales[0]?.notices ?? [])).toBe(false);
  });
});

describe("translate: plural generation no-change cases", () => {
  it("source already complete: no new keys, no extra forms, no notice", async () => {
    const complete = {
      items_one: "{{count}} item",
      items_few: "{{count}} few",
      items_many: "{{count}} many",
      items_other: "{{count}} items",
    };
    const dir = await project(complete, { pl: {} });

    const summary = await translate(
      { config: cfg(), cwd: dir, generatePlurals: true },
      { createProvider: () => makeStubProvider().provider },
    );

    expect(summary.locales[0]?.generated).toEqual([]);
    expect(hasNotice(summary.locales[0]?.notices ?? [])).toBe(false);
  });

  it("a non-plural key is never considered for generation", async () => {
    const dir = await project({ greeting: "Hello" }, { pl: {} });

    const summary = await translate(
      { config: cfg(), cwd: dir, generatePlurals: true },
      { createProvider: () => makeStubProvider().provider },
    );

    const pl = (await readJsonFile(targetPath(dir, "pl"))) as Record<string, string>;
    expect(Object.keys(pl).some((k) => k.includes("_few"))).toBe(false);
    expect(summary.locales[0]?.generated).toEqual([]);
    expect(hasNotice(summary.locales[0]?.notices ?? [])).toBe(false);
  });

  it("generation disabled (default): behavior is identical to today (warn, generate nothing)", async () => {
    const dir = await project(PLURAL_SOURCE, { pl: {} });

    const summary = await translate(
      { config: cfg(), cwd: dir },
      { createProvider: () => makeStubProvider().provider },
    );

    const pl = (await readJsonFile(targetPath(dir, "pl"))) as Record<string, string>;
    expect(pl.items_few).toBeUndefined();
    expect(summary.locales[0]?.generated).toEqual([]);
    expect(hasNotice(summary.locales[0]?.notices ?? [])).toBe(true);
  });

  it("the config option alone enables generation (no per-run override)", async () => {
    const dir = await project(PLURAL_SOURCE, { pl: {} });

    const summary = await translate(
      { config: cfg({ generatePlurals: true }), cwd: dir },
      { createProvider: () => makeStubProvider().provider },
    );

    expect(summary.locales[0]?.generated).toEqual(["items_few", "items_many"]);
  });

  it("the per-run override takes precedence over the config option", async () => {
    const dir = await project(PLURAL_SOURCE, { pl: {} });

    const summary = await translate(
      { config: cfg({ generatePlurals: false }), cwd: dir, generatePlurals: true },
      { createProvider: () => makeStubProvider().provider },
    );

    expect(summary.locales[0]?.generated).toEqual(["items_few", "items_many"]);
  });
});

describe("translate: plural generation lock and re-run", () => {
  it("a generated key is not regenerated on a second identical run", async () => {
    const dir = await project(PLURAL_SOURCE, { pl: {} });

    await translate(
      { config: cfg(), cwd: dir, generatePlurals: true },
      { createProvider: () => makeStubProvider().provider },
    );
    const second = makeStubProvider();
    const summary = await translate(
      { config: cfg(), cwd: dir, generatePlurals: true },
      { createProvider: () => second.provider },
    );

    expect(summary.locales[0]?.generated).toEqual([]);
    const pl = (await readJsonFile(targetPath(dir, "pl"))) as Record<string, string>;
    expect(pl.items_few).toBeDefined();
    const lock = (await readJsonFile(lockPath(dir))) as LockShape;
    expect(lock.locales.pl?.items_few).toBeDefined();
  });

  it("changing a governing source plural form reconsiders the generated forms next run", async () => {
    const dir = await project(PLURAL_SOURCE, { pl: {} });

    await translate(
      { config: cfg(), cwd: dir, generatePlurals: true },
      { createProvider: () => makeStubProvider().provider },
    );

    await writeJsonFile(join(dir, "locales", "en.json"), {
      items_one: "{{count}} item",
      items_other: "{{count}} ITEMS CHANGED",
    });
    const summary = await translate(
      { config: cfg(), cwd: dir, generatePlurals: true },
      { createProvider: () => makeStubProvider().provider },
    );

    expect(summary.locales[0]?.generated).toEqual(["items_few", "items_many"]);
  });

  it("a withheld generated key is retried on the next run", async () => {
    const dir = await project(PLURAL_SOURCE, { pl: {} });

    await translate(
      { config: cfg(), cwd: dir, generatePlurals: true },
      {
        createProvider: () => makeStubProvider({ failIntegrity: new Set(["items_few"]) }).provider,
      },
    );
    const summary = await translate(
      { config: cfg(), cwd: dir, generatePlurals: true },
      { createProvider: () => makeStubProvider().provider },
    );

    expect(summary.locales[0]?.generated).toContain("items_few");
    const pl = (await readJsonFile(targetPath(dir, "pl"))) as Record<string, string>;
    expect(pl.items_few).toBeDefined();
  });

  it("generated keys are not pruned as orphans", async () => {
    const dir = await project(PLURAL_SOURCE, { pl: {} });

    await translate(
      { config: cfg(), cwd: dir, generatePlurals: true },
      { createProvider: () => makeStubProvider().provider },
    );
    const summary = await translate(
      { config: cfg(), cwd: dir, generatePlurals: true, prune: true },
      { createProvider: () => makeStubProvider().provider },
    );

    expect(summary.locales[0]?.pruned).toEqual([]);
    const pl = (await readJsonFile(targetPath(dir, "pl"))) as Record<string, string>;
    expect(pl.items_few).toBeDefined();
    expect(pl.items_many).toBeDefined();
  });
});

describe("translate: plural generation adopts existing target forms", () => {
  const HAND_WRITTEN = "{{count}} hand-written form";
  const SEEDED_PL = { items_one: "{{count}} sztuka", items_other: "{{count}} sztuk" };

  it("keeps a hand-written plural form on a first run and still generates its missing sibling", async () => {
    const dir = await project(PLURAL_SOURCE, { pl: { ...SEEDED_PL, items_few: HAND_WRITTEN } });

    const summary = await translate(
      { config: cfg(), cwd: dir, generatePlurals: true },
      { createProvider: () => makeStubProvider().provider },
    );

    const pl = (await readJsonFile(targetPath(dir, "pl"))) as Record<string, string>;
    expect(pl.items_few).toBe(HAND_WRITTEN);
    expect(pl.items_many).toBeDefined();
    expect(summary.locales[0]?.generated).toEqual(["items_many"]);
    expect(summary.locales[0]?.translated).toEqual([]);
    expect(summary.locales[0]?.integrityMismatches).toEqual([]);
  });

  it("leaves an adopted form untracked in the lock file while locking the generated sibling", async () => {
    const dir = await project(PLURAL_SOURCE, { pl: { ...SEEDED_PL, items_few: HAND_WRITTEN } });

    await translate(
      { config: cfg(), cwd: dir, generatePlurals: true },
      { createProvider: () => makeStubProvider().provider },
    );

    const lock = (await readJsonFile(lockPath(dir))) as LockShape;
    expect(lock.locales.pl?.items_few).toBeUndefined();
    expect(lock.locales.pl?.items_many).toBeDefined();
  });

  it("keeps adopting the hand-written form on later runs, so the protection is not first-run only", async () => {
    const dir = await project(PLURAL_SOURCE, { pl: { ...SEEDED_PL, items_few: HAND_WRITTEN } });

    await translate(
      { config: cfg(), cwd: dir, generatePlurals: true },
      { createProvider: () => makeStubProvider().provider },
    );
    const summary = await translate(
      { config: cfg(), cwd: dir, generatePlurals: true },
      { createProvider: () => makeStubProvider().provider },
    );

    expect(summary.locales[0]?.generated).toEqual([]);
    const pl = (await readJsonFile(targetPath(dir, "pl"))) as Record<string, string>;
    expect(pl.items_few).toBe(HAND_WRITTEN);
  });
});

describe("translate: plural generation determinism", () => {
  it("two runs over identical inputs produce the same key-set and byte-identical lock-file", async () => {
    const build = async (): Promise<{ generated: readonly string[]; lock: string }> => {
      const dir = await project(PLURAL_SOURCE, { pl: {} });
      const summary = await translate(
        { config: cfg(), cwd: dir, generatePlurals: true },
        { createProvider: () => makeStubProvider().provider },
      );
      return {
        generated: summary.locales[0]?.generated ?? [],
        lock: await readTextFile(lockPath(dir)),
      };
    };

    const run1 = await build();
    const run2 = await build();
    expect(run1.generated).toEqual(run2.generated);
    expect(run1.lock).toBe(run2.lock);
  });
});

describe("translate: generation off does not protect a source-absent plural-shaped key from pruning", () => {
  const STALE_TARGET = {
    items_one: "{{count}} sztuka",
    items_other: "{{count}} sztuk",
    items_few: "{{count}} sztuki",
  };

  it("reports and prunes the stale items_few when generation is off and prune is on", async () => {
    const dir = await project(PLURAL_SOURCE, { pl: STALE_TARGET });

    const summary = await translate(
      { config: cfg(), cwd: dir, prune: true },
      { createProvider: () => makeStubProvider().provider },
    );

    expect(summary.locales[0]?.orphaned).toEqual(["items_few"]);
    expect(summary.locales[0]?.pruned).toEqual(["items_few"]);
    const pl = (await readJsonFile(targetPath(dir, "pl"))) as Record<string, string>;
    expect(pl.items_few).toBeUndefined();
    expect(pl.items_one).toBe("{{count}} sztuka");
    expect(pl.items_other).toBe("{{count}} sztuk");
  });

  it("a prior lock entry for the pruned items_few does not survive when generation is off", async () => {
    const dir = await project(PLURAL_SOURCE, { pl: STALE_TARGET });
    await writeFile(
      lockPath(dir),
      `${JSON.stringify({ version: 1, locales: { pl: { items_few: "leftover" } } }, null, 2)}\n`,
      "utf8",
    );

    await translate(
      { config: cfg(), cwd: dir, prune: true },
      { createProvider: () => makeStubProvider().provider },
    );

    const lock = (await readJsonFile(lockPath(dir))) as LockShape;
    expect(lock.locales.pl?.items_few).toBeUndefined();
    const pl = (await readJsonFile(targetPath(dir, "pl"))) as Record<string, string>;
    expect(pl.items_few).toBeUndefined();
  });

  it("the same stale items_few is protected (not orphaned, not pruned) when generation is on", async () => {
    const dir = await project(PLURAL_SOURCE, { pl: STALE_TARGET });

    const summary = await translate(
      { config: cfg(), cwd: dir, generatePlurals: true, prune: true },
      { createProvider: () => makeStubProvider().provider },
    );

    expect(summary.locales[0]?.orphaned).toEqual([]);
    expect(summary.locales[0]?.pruned).toEqual([]);
    const pl = (await readJsonFile(targetPath(dir, "pl"))) as Record<string, string>;
    expect(pl.items_few).toBeDefined();
  });
});

const GENERATION_PASS: PlaceholderIntegrityResult = {
  matches: true,
  missing: [],
  extra: [],
  reordered: false,
};

function throwingKeyProvider(throwKey: string): {
  provider: TranslationProvider;
  calls: TranslateRequest[];
} {
  const calls: TranslateRequest[] = [];
  const provider: TranslationProvider = {
    id: "throwing",
    kind: "llm",
    supportsGlossary: true,
    translateBatch: async (request: TranslateRequest): Promise<TranslateResult> => {
      calls.push(request);
      if (request.entries.some((entry) => entry.key === throwKey)) {
        throw Object.assign(new Error("generation sub-batch blew up"), { code: "PROVIDER_ERROR" });
      }
      const values = new Map<string, string>();
      const integrity = new Map<string, PlaceholderIntegrityResult>();
      for (const entry of request.entries) {
        values.set(entry.key, `[${request.targetLocale}] ${entry.value}`);
        integrity.set(entry.key, GENERATION_PASS);
      }
      return { values, integrity };
    },
  };
  return { provider, calls };
}

describe("translate: plural generation respects maxBatchSize", () => {
  it("splits a large stale generation set into multiple bounded provider requests", async () => {
    const dir = await project(PLURAL_SOURCE, {
      ar: { items_one: "seeded one", items_other: "seeded other" },
    });
    const stub = makeStubProvider();

    const summary = await translate(
      { config: cfg({ targetLocales: ["ar"], maxBatchSize: 2 }), cwd: dir, generatePlurals: true },
      { createProvider: () => stub.provider },
    );

    expect(stub.calls).toHaveLength(2);
    for (const call of stub.calls) {
      expect(call.request.entries.length).toBeLessThanOrEqual(2);
    }
    const sentKeys = stub.calls.flatMap((c) => c.request.entries.map((e) => e.key));
    expect(sentKeys.sort()).toEqual(["items_few", "items_many", "items_two", "items_zero"]);
    expect(new Set(sentKeys).size).toBe(sentKeys.length);
    expect(summary.locales[0]?.generated).toEqual([
      "items_few",
      "items_many",
      "items_two",
      "items_zero",
    ]);
  });

  it("issues a single generation request when the stale set is at or below maxBatchSize", async () => {
    const dir = await project(PLURAL_SOURCE, { pl: {} });
    const stub = makeStubProvider();

    await translate(
      { config: cfg({ maxBatchSize: 50 }), cwd: dir, generatePlurals: true },
      { createProvider: () => stub.provider },
    );

    const generationCalls = stub.calls.filter((c) =>
      c.request.entries.every((e) => e.key === "items_few" || e.key === "items_many"),
    );
    expect(generationCalls).toHaveLength(1);
  });
});

describe("translate: plural generation and the token budget", () => {
  it("counts plural-generation usage alongside main-translation usage in the locale total", async () => {
    const usage = { inputTokens: 10, outputTokens: 10 };

    const withGenerationDir = await project(PLURAL_SOURCE, { pl: {} });
    const withGeneration = await translate(
      { config: cfg(), cwd: withGenerationDir, generatePlurals: true },
      { createProvider: () => makeStubProvider({ usage }).provider },
    );

    const withoutGenerationDir = await project(PLURAL_SOURCE, { pl: {} });
    const withoutGeneration = await translate(
      { config: cfg(), cwd: withoutGenerationDir, generatePlurals: false },
      { createProvider: () => makeStubProvider({ usage }).provider },
    );

    const withTokens = withGeneration.locales[0]?.usage;
    const withoutTokens = withoutGeneration.locales[0]?.usage;
    expect(withTokens).toBeDefined();
    expect(withoutTokens).toBeDefined();
    const withTotal = (withTokens?.inputTokens ?? 0) + (withTokens?.outputTokens ?? 0);
    const withoutTotal = (withoutTokens?.inputTokens ?? 0) + (withoutTokens?.outputTokens ?? 0);
    expect(withTotal).toBeGreaterThan(withoutTotal);
  });

  it("skips generation entirely once the budget already stopped during main translation", async () => {
    const dir = await project(PLURAL_SOURCE, { pl: {} });
    const stub = makeStubProvider({ usage: { inputTokens: 60, outputTokens: 40 } });

    const summary = await translate(
      {
        config: cfg({ maxTokens: 50, budgetBehavior: "stop" }),
        cwd: dir,
        generatePlurals: true,
      },
      { createProvider: () => stub.provider },
    );

    const locale = summary.locales[0];
    expect([...(locale?.translated ?? [])].sort()).toEqual(["items_one", "items_other"]);
    expect(locale?.generated).toEqual([]);
    expect([...(locale?.budgetWithheld ?? [])].sort()).toEqual(["items_few", "items_many"]);
    expect(locale?.notices.map((n) => n.code)).toContain("BUDGET_TOKENS_EXCEEDED");

    const pl = (await readJsonFile(targetPath(dir, "pl"))) as Record<string, string>;
    expect(pl.items_few).toBeUndefined();
    expect(pl.items_many).toBeUndefined();
  });

  it("trips the budget during generation's own sub-batches, withholding the remaining generation batch", async () => {
    const dir = await project(PLURAL_SOURCE, {
      ar: { items_one: "seeded one", items_other: "seeded other" },
    });
    const stub = makeStubProvider({ usage: { inputTokens: 60, outputTokens: 40 } });

    const summary = await translate(
      {
        config: cfg({
          targetLocales: ["ar"],
          maxBatchSize: 2,
          maxTokens: 100,
          budgetBehavior: "stop",
        }),
        cwd: dir,
        generatePlurals: true,
      },
      { createProvider: () => stub.provider },
    );

    const locale = summary.locales[0];
    expect([...(locale?.generated ?? [])].sort()).toEqual(["items_two", "items_zero"]);
    expect([...(locale?.budgetWithheld ?? [])].sort()).toEqual(["items_few", "items_many"]);
    expect(locale?.notices.map((n) => n.code)).toContain("BUDGET_TOKENS_EXCEEDED");
    expect(locale?.status).toBe("partial");
    expect(summary.partial).toEqual(["ar"]);
    expect(summary.failed).toEqual([]);
  });
});

describe("translate: a failed plural-generation sub-batch does not discard accepted work", () => {
  it("withholds only the thrown sub-batch's forms; main translations and the other sub-batch survive", async () => {
    const dir = await project(PLURAL_SOURCE, { ar: {} });
    const { provider, calls } = throwingKeyProvider("items_two");

    const summary = await translate(
      { config: cfg({ targetLocales: ["ar"], maxBatchSize: 2 }), cwd: dir, generatePlurals: true },
      { createProvider: () => provider },
    );

    expect(summary.locales[0]?.status).toBe("partial");
    expect([...(summary.locales[0]?.translated ?? [])].sort()).toEqual([
      "items_one",
      "items_other",
    ]);
    expect(summary.locales[0]?.generated).toEqual(["items_few", "items_many"]);
    expect(summary.locales[0]?.integrityMismatches).toEqual([]);
    expect([...(summary.locales[0]?.providerFailures ?? [])].sort()).toEqual([
      "items_two",
      "items_zero",
    ]);
    expect(summary.locales[0]?.notices.map((n) => n.code)).toContain("SUB_BATCH_FAILED");

    const ar = (await readJsonFile(targetPath(dir, "ar"))) as Record<string, string>;
    expect(ar.items_one).toBeDefined();
    expect(ar.items_other).toBeDefined();
    expect(ar.items_few).toBeDefined();
    expect(ar.items_many).toBeDefined();
    expect(ar.items_zero).toBeUndefined();
    expect(ar.items_two).toBeUndefined();

    expect(calls.length).toBeGreaterThan(1);
  });

  it("does not lock the withheld sub-batch's keys, so they retry next run", async () => {
    const dir = await project(PLURAL_SOURCE, { ar: {} });
    const { provider } = throwingKeyProvider("items_two");

    await translate(
      { config: cfg({ targetLocales: ["ar"], maxBatchSize: 2 }), cwd: dir, generatePlurals: true },
      { createProvider: () => provider },
    );

    const lock = (await readJsonFile(lockPath(dir))) as LockShape;
    expect(lock.locales.ar?.items_zero).toBeUndefined();
    expect(lock.locales.ar?.items_two).toBeUndefined();
    expect(lock.locales.ar?.items_few).toBeDefined();
    expect(lock.locales.ar?.items_many).toBeDefined();
    expect(lock.locales.ar?.items_one).toBeDefined();
    expect(lock.locales.ar?.items_other).toBeDefined();
  });
});

describe("generatePluralForms: comparePlaceholders wiring (the second buildRequest-shaped site)", () => {
  function pluralEntry(key: string, value: string): TranslationEntry {
    return { key, namespace: "n", value, placeholders: [], isPlural: true };
  }

  function sourceResource(): LocaleResource {
    return {
      locale: "en",
      namespace: "n",
      format: "i18next-json",
      entries: new Map([
        ["items_one", pluralEntry("items_one", "{{count}} item")],
        ["items_other", pluralEntry("items_other", "{{count}} items")],
      ]),
    };
  }

  function fakeAdapter(comparePlaceholders: PlaceholderComparator | undefined): FormatAdapter {
    return {
      format: "i18next-json",
      canHandle: () => true,
      read: () => Promise.reject(new Error("not exercised by this test")),
      write: () => Promise.resolve(),
      extractPlaceholders: () => [],
      validateMessage: () => true,
      ...(comparePlaceholders !== undefined ? { comparePlaceholders } : {}),
    };
  }

  function capturingProvider(): { provider: TranslationProvider; requests: TranslateRequest[] } {
    const requests: TranslateRequest[] = [];
    const provider: TranslationProvider = {
      id: "stub",
      kind: "llm",
      supportsGlossary: true,
      translateBatch: (request: TranslateRequest): Promise<TranslateResult> => {
        requests.push(request);
        const values = new Map<string, string>();
        const integrity = new Map<string, PlaceholderIntegrityResult>();
        for (const entry of request.entries) {
          values.set(entry.key, `[pl] ${entry.value}`);
          integrity.set(entry.key, { matches: true, missing: [], extra: [], reordered: false });
        }
        return Promise.resolve({ values, integrity });
      },
    };
    return { provider, requests };
  }

  function context(adapter: FormatAdapter, provider: TranslationProvider): PluralGenerationContext {
    return {
      source: sourceResource(),
      sourceLocale: "en",
      targetLocale: "pl",
      format: "i18next-json",
      adapter,
      provider,
      glossary: undefined,
      maxLength: undefined,
      tone: undefined,
      baseline: new Map(),
      targetKeys: new Set(),
      maxBatchSize: 50,
      budget: createBudgetTracker(undefined, "warn"),
    };
  }

  it("passes the adapter's comparePlaceholders through to the generation request when present", async () => {
    const spyComparator: PlaceholderComparator = () => ({
      matches: true,
      missing: [],
      extra: [],
      reordered: false,
    });
    const { provider, requests } = capturingProvider();

    await generatePluralForms(context(fakeAdapter(spyComparator), provider));

    expect(requests).toHaveLength(1);
    expect(requests[0]?.comparePlaceholders).toBe(spyComparator);
  });

  it("omits comparePlaceholders from the generation request when the adapter has none", async () => {
    const { provider, requests } = capturingProvider();

    await generatePluralForms(context(fakeAdapter(undefined), provider));

    expect(requests).toHaveLength(1);
    expect(requests[0]).not.toHaveProperty("comparePlaceholders");
  });

  it("passes the configured length budgets through to the generation request", async () => {
    const { provider, requests } = capturingProvider();
    const budgets = new Map([["items_other", 12]]);

    await generatePluralForms({
      ...context(fakeAdapter(undefined), provider),
      maxLength: budgets,
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]?.maxLength?.get("items_other")).toBe(12);
  });

  it("omits the length budgets from the generation request when none are configured", async () => {
    const { provider, requests } = capturingProvider();

    await generatePluralForms(context(fakeAdapter(undefined), provider));

    expect(requests).toHaveLength(1);
    expect(requests[0]).not.toHaveProperty("maxLength");
  });
});

describe("generatePluralForms: accept/withhold is recomputed via gateCandidateValue, not the provider's self-report", () => {
  function pluralEntry(key: string, value: string): TranslationEntry {
    return { key, namespace: "n", value, placeholders: [], isPlural: true };
  }

  function sourceResource(): LocaleResource {
    return {
      locale: "en",
      namespace: "n",
      format: "i18next-json",
      entries: new Map([
        ["items_one", pluralEntry("items_one", "{{count}} item")],
        ["items_other", pluralEntry("items_other", "{{count}} items")],
      ]),
    };
  }

  function fakeAdapter(comparePlaceholders: PlaceholderComparator): FormatAdapter {
    return {
      format: "i18next-json",
      canHandle: () => true,
      read: () => Promise.reject(new Error("not exercised by this test")),
      write: () => Promise.resolve(),
      extractPlaceholders: () => [],
      validateMessage: () => true,
      comparePlaceholders,
    };
  }

  function providerReporting(claimedMatch: boolean): TranslationProvider {
    return {
      id: "stub",
      kind: "llm",
      supportsGlossary: true,
      translateBatch: (request: TranslateRequest): Promise<TranslateResult> => {
        const values = new Map<string, string>();
        const integrity = new Map<string, PlaceholderIntegrityResult>();
        for (const entry of request.entries) {
          values.set(entry.key, `[pl] ${entry.value}`);
          integrity.set(entry.key, {
            matches: claimedMatch,
            missing: claimedMatch ? [] : ["{{count}}"],
            extra: [],
            reordered: false,
          });
        }
        return Promise.resolve({ values, integrity });
      },
    };
  }

  function context(adapter: FormatAdapter, provider: TranslationProvider): PluralGenerationContext {
    return {
      source: sourceResource(),
      sourceLocale: "en",
      targetLocale: "pl",
      format: "i18next-json",
      adapter,
      provider,
      glossary: undefined,
      maxLength: undefined,
      tone: undefined,
      baseline: new Map(),
      targetKeys: new Set(),
      maxBatchSize: 50,
      budget: createBudgetTracker(undefined, "warn"),
    };
  }

  it("withholds a generated form when the provider falsely self-reports a match but the adapter's own check disagrees", async () => {
    const disagreeingAdapter = fakeAdapter(() => ({
      matches: false,
      missing: ["{{count}}"],
      extra: [],
      reordered: false,
    }));

    const result = await generatePluralForms(context(disagreeingAdapter, providerReporting(true)));

    expect(result.accepted).toEqual([]);
    expect(result.withheld.length).toBeGreaterThan(0);
  });

  it("still accepts a generated form when the adapter agrees the placeholders match (unchanged common-path behavior)", async () => {
    const agreeingAdapter = fakeAdapter(() => ({
      matches: true,
      missing: [],
      extra: [],
      reordered: false,
    }));

    const result = await generatePluralForms(context(agreeingAdapter, providerReporting(true)));

    expect(result.withheld).toEqual([]);
    expect(result.accepted.length).toBeGreaterThan(0);
  });

  it("still withholds a generated form when the adapter agrees the placeholders do not match (unchanged common-path behavior)", async () => {
    const agreeingAdapter = fakeAdapter(() => ({
      matches: false,
      missing: ["{{count}}"],
      extra: [],
      reordered: false,
    }));

    const result = await generatePluralForms(context(agreeingAdapter, providerReporting(false)));

    expect(result.accepted).toEqual([]);
    expect(result.withheld.length).toBeGreaterThan(0);
  });
});
