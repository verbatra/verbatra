import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { contentHash, type TranslationEntry } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import { defaultFs, type SdkFs } from "../fs.js";
import { localeLockPath } from "../lock/locale-write-lock.js";
import { valueHash } from "../lock/provenance-file.js";
import {
  baseConfig,
  makeTempDir,
  readJsonFile,
  readTextFile,
  writeJsonFile,
} from "../test-support.js";
import { check } from "./check.js";
import {
  applyValueReplace,
  previewValueReplace,
  type ValueReplaceEntryRef,
  type ValueReplacePreviewEntry,
} from "./value-replace.js";

type Strings = Record<string, string>;
type Record_ = { readonly origin: string; readonly value: string; readonly extra?: object };

interface ProjectOptions {
  readonly source: Strings;
  readonly targets?: Readonly<Record<string, Strings>>;
  readonly config?: Partial<VerbatraConfig>;
  readonly lock?: Readonly<Record<string, Record<string, string>>>;
  readonly provenance?: Readonly<Record<string, Readonly<Record<string, Record_>>>>;
}

interface Project {
  readonly dir: string;
  readonly config: VerbatraConfig;
}

async function project(options: ProjectOptions): Promise<Project> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), options.source);
  for (const [locale, strings] of Object.entries(options.targets ?? { de: {} })) {
    await writeJsonFile(join(dir, "locales", `${locale}.json`), strings);
  }
  if (options.lock !== undefined) {
    await writeJsonFile(join(dir, "verbatra.lock.json"), { version: 1, locales: options.lock });
  }
  if (options.provenance !== undefined) {
    const locales: Record<string, Record<string, unknown>> = {};
    for (const [locale, records] of Object.entries(options.provenance)) {
      locales[locale] = Object.fromEntries(
        Object.entries(records).map(([key, record]) => [
          key,
          { origin: record.origin, valueHash: valueHash(record.value), ...record.extra },
        ]),
      );
    }
    await writeJsonFile(join(dir, "verbatra.provenance.json"), { version: 1, locales });
  }
  const targetLocales = Object.keys(options.targets ?? { de: {} });
  return { dir, config: baseConfig({ targetLocales, ...options.config }) };
}

function refsOf(
  entries: readonly ValueReplacePreviewEntry[],
  statuses: readonly string[] = ["ready", "stale-source"],
): ValueReplaceEntryRef[] {
  return entries
    .filter((entry) => statuses.includes(entry.status))
    .map(({ locale, key, valueHash: hash }) => ({ locale, key, valueHash: hash }));
}

async function readLocale(dir: string, locale: string): Promise<Strings> {
  return (await readJsonFile(join(dir, "locales", `${locale}.json`))) as Strings;
}

interface LockShape {
  readonly locales: Record<string, Record<string, string>>;
}

async function readLock(dir: string): Promise<LockShape> {
  return (await readJsonFile(join(dir, "verbatra.lock.json"))) as LockShape;
}

interface ProvenanceShape {
  readonly locales: Record<string, Record<string, Record<string, string>>>;
}

async function readProvenance(dir: string): Promise<ProvenanceShape> {
  return (await readJsonFile(join(dir, "verbatra.provenance.json"))) as ProvenanceShape;
}

function entryOf(key: string, value: string, placeholders: string[] = []): TranslationEntry {
  return { key, namespace: "en", value, placeholders, isPlural: false };
}

async function preview(p: Project, find: string, replace: string, extra: object = {}) {
  return previewValueReplace({ config: p.config, cwd: p.dir, find, replace, ...extra });
}

async function apply(
  p: Project,
  find: string,
  replace: string,
  entries: readonly ValueReplaceEntryRef[],
  extra: object = {},
) {
  return applyValueReplace({
    config: p.config,
    cwd: p.dir,
    find,
    replace,
    entries,
    actor: "human",
    ...extra,
  });
}

describe("previewValueReplace: matching", () => {
  it("lists only target values that contain the text, and never searches the source", async () => {
    const p = await project({
      source: { a: "Colour here", b: "Plain", c: "Colour too" },
      targets: { de: { a: "Farbe Colour", b: "Einfach", c: "Auch" } },
    });

    const result = await preview(p, "Colour", "Color");

    expect(result.entries.map((entry) => entry.key)).toEqual(["a"]);
    expect(result.truncated).toBe(false);
  });

  it("returns the provenance hash of the current value", async () => {
    const p = await project({ source: { a: "Hi" }, targets: { de: { a: "Hallo Welt" } } });

    const result = await preview(p, "Welt", "Erde");

    expect(result.entries[0]?.valueHash).toBe(valueHash("Hallo Welt"));
    expect(result.entries[0]).toMatchObject({
      status: "ready",
      before: "Hallo Welt",
      after: "Hallo Erde",
      excerptCut: false,
    });
  });

  it("is case sensitive by default and case insensitive on request", async () => {
    const p = await project({ source: { a: "x" }, targets: { de: { a: "Colour COLOUR" } } });

    expect((await preview(p, "colour", "c")).entries).toHaveLength(0);
    const insensitive = await preview(p, "colour", "c", { caseSensitive: false });
    expect(insensitive.entries[0]?.after).toBe("c c");
  });

  it("searches the requested locales only, in config order", async () => {
    const p = await project({
      source: { a: "x" },
      targets: { de: { a: "Wort" }, fr: { a: "Wort" }, es: { a: "Wort" } },
    });

    const result = await preview(p, "Wort", "Mot", { locales: ["fr", "de"] });

    expect(result.entries.map((entry) => entry.locale)).toEqual(["de", "fr"]);
  });

  it("refuses an unknown locale", async () => {
    const p = await project({ source: { a: "x" } });
    await expect(preview(p, "a", "b", { locales: ["xx"] })).rejects.toMatchObject({
      code: "UNKNOWN_LOCALE",
    });
  });

  it("treats a missing target file as having no values", async () => {
    const p = await project({ source: { a: "x" }, targets: { de: {} } });
    const config = baseConfig({ targetLocales: ["de", "fr"] });

    const result = await previewValueReplace({ config, cwd: p.dir, find: "x", replace: "y" });

    expect(result.entries).toEqual([]);
  });
});

describe("previewValueReplace: find text bounds", () => {
  it("refuses an empty find text before reading anything", async () => {
    const p = await project({ source: { a: "x" } });
    await rejectsFind(preview(p, "", "y"));
    await rejectsFind(apply(p, "", "y", []));
  });

  it("refuses a find text above 20,000 characters and accepts exactly 20,000", async () => {
    const p = await project({ source: { a: "x" }, targets: { de: { a: "x" } } });
    await rejectsFind(preview(p, "a".repeat(20_001), "y"));
    await rejectsFind(apply(p, "a".repeat(20_001), "y", []));

    const result = await preview(p, "a".repeat(20_000), "y");
    expect(result.entries).toEqual([]);
  });

  it("refuses a find text or a replace text with an unpaired surrogate", async () => {
    const p = await project({ source: { a: "x" }, targets: { de: { a: "Hi 😀" } } });
    await rejectsFind(preview(p, "\ud83d", "y"));
    await rejectsFind(preview(p, "\ude00", "y"));
    await rejectsFind(preview(p, "Hi", "\ud800"));
    await rejectsFind(apply(p, "\ud83d", "y", []));
    await rejectsFind(apply(p, "Hi", "\udfff", []));

    const result = await preview(p, "😀", "🙂");
    expect(result.entries).toHaveLength(1);
  });

  async function rejectsFind(call: Promise<unknown>): Promise<void> {
    await expect(call).rejects.toMatchObject({ code: "FIND_TEXT_INVALID" });
  }
});

describe("previewValueReplace: literal replacement", () => {
  it.each(["$&", "$1", "$'", "$$", "$`"])("inserts %s exactly as written", async (replacement) => {
    const p = await project({ source: { a: "x" }, targets: { de: { a: "Wert A" } } });

    const result = await preview(p, "A", replacement);

    expect(result.entries[0]?.after).toBe(`Wert ${replacement}`);
  });

  it("treats pattern characters in the find text literally", async () => {
    const p = await project({
      source: { a: "x", b: "y" },
      targets: { de: { a: "1+1=2 (ja)", b: "1111" } },
    });

    const result = await preview(p, "1+1", "eins");

    expect(result.entries.map((entry) => entry.key)).toEqual(["a"]);
    expect(result.entries[0]?.after).toBe("eins=2 (ja)");
  });
});

describe("previewValueReplace: statuses", () => {
  it("reports ready for a value that passes the gate", async () => {
    const p = await project({ source: { a: "Hello" }, targets: { de: { a: "Hallo Welt" } } });
    const result = await preview(p, "Welt", "Erde");
    expect(result.entries[0]?.status).toBe("ready");
    expect(result.counts.ready).toBe(1);
  });

  it("reports gate-refused with the reason and details when a placeholder would break", async () => {
    const p = await project({
      source: { a: "Hello {{name}}" },
      targets: { de: { a: "Hallo {{name}}" } },
    });

    const result = await preview(p, "name", "vorname");

    expect(result.entries[0]).toMatchObject({
      status: "gate-refused",
      reason: "placeholder",
      details: ["-{{name}}", "+{{vorname}}"],
    });
    expect(result.counts["gate-refused"]).toBe(1);
  });

  it("reports gate-refused empty when the replacement blanks a value", async () => {
    const p = await project({ source: { a: "Hello" }, targets: { de: { a: "Hallo" } } });
    const result = await preview(p, "Hallo", "");
    expect(result.entries[0]).toMatchObject({ status: "gate-refused", reason: "empty" });
  });

  it("reports gate-refused degenerate when the replacement multiplies the value", async () => {
    const p = await project({
      source: { a: "Hello there" },
      targets: { de: { a: "Hallo da" } },
    });
    const result = await preview(p, "Hallo da", "ab".repeat(200));
    expect(result.entries[0]).toMatchObject({ status: "gate-refused", reason: "degenerate" });
  });

  it("reports too-long for a replaced value above 20,000 characters, without building it", async () => {
    const p = await project({ source: { a: "Hello" }, targets: { de: { a: "Hallo Welt" } } });

    const result = await preview(p, "Welt", "x".repeat(20_000));

    expect(result.entries[0]).toMatchObject({ status: "too-long", after: "", excerptCut: true });
    expect(result.entries[0]?.reason).toBeUndefined();
    expect(result.counts["too-long"]).toBe(1);
    expect(result.counts["gate-refused"]).toBe(0);
  });

  it("reports pinned for a key matching pinnedKeys", async () => {
    const p = await project({
      source: { brand_name: "Brand", other: "Other" },
      targets: { de: { brand_name: "Marke X", other: "Anderes X" } },
      config: { pinnedKeys: ["brand_*"] },
    });

    const result = await preview(p, "X", "Y");

    expect(result.entries.map((entry) => [entry.key, entry.status])).toEqual([
      ["brand_name", "pinned"],
      ["other", "ready"],
    ]);
    expect(result.counts.pinned).toBe(1);
  });

  it("reports protected for a value a person wrote, whatever humanEdits says", async () => {
    const overwrite = await project({
      source: { a: "Hello", b: "Bye" },
      targets: { de: { a: "Hallo X", b: "Tschuess X" } },
      provenance: { de: { a: { origin: "human", value: "Hallo X" } } },
      config: { humanEdits: "overwrite" },
    });

    const result = await preview(overwrite, "X", "Y");

    expect(result.entries.map((entry) => [entry.key, entry.status])).toEqual([
      ["a", "protected"],
      ["b", "ready"],
    ]);
    expect(result.counts.protected).toBe(1);
  });

  it.each(["human", "import"])("reports an origin of %s as protected", async (origin) => {
    const p = await project({
      source: { a: "Hello" },
      targets: { de: { a: "Hallo X" } },
      provenance: { de: { a: { origin, value: "Hallo X" } } },
    });
    expect((await preview(p, "X", "Y")).entries[0]?.status).toBe("protected");
  });

  it("reports a machine origin as ready", async () => {
    const p = await project({
      source: { a: "Hello" },
      targets: { de: { a: "Hallo X" } },
      provenance: { de: { a: { origin: "machine", value: "Hallo X" } } },
    });
    expect((await preview(p, "X", "Y")).entries[0]?.status).toBe("ready");
  });

  it("reports a value changed outside verbatra as protected", async () => {
    const p = await project({
      source: { a: "Hello" },
      targets: { de: { a: "Hallo X edited" } },
      provenance: { de: { a: { origin: "machine", value: "Hallo X" } } },
    });
    expect((await preview(p, "X", "Y")).entries[0]?.status).toBe("protected");
  });

  it("does not protect a human value whose review state is rejected", async () => {
    const p = await project({
      source: { a: "Hello" },
      targets: { de: { a: "Hallo X" } },
      provenance: {
        de: { a: { origin: "human", value: "Hallo X", extra: { reviewState: "rejected" } } },
      },
    });
    expect((await preview(p, "X", "Y")).entries[0]?.status).toBe("ready");
  });

  it("marks every value protected when the provenance file is corrupt", async () => {
    const p = await project({ source: { a: "Hello" }, targets: { de: { a: "Hallo X" } } });
    await writeJsonFile(join(p.dir, "verbatra.provenance.json"), { version: 1, locales: [] });

    const result = await preview(p, "X", "Y");

    expect(result.entries[0]?.status).toBe("protected");
  });

  it("marks every value protected when the provenance file is from a newer verbatra", async () => {
    const p = await project({ source: { a: "Hello" }, targets: { de: { a: "Hallo X" } } });
    await writeJsonFile(join(p.dir, "verbatra.provenance.json"), { version: 99, locales: {} });

    const result = await preview(p, "X", "Y");

    expect(result.entries[0]?.status).toBe("protected");
  });

  it("reports stale-source for a key whose source changed since the lock baseline", async () => {
    const p = await project({
      source: { a: "Hello new", b: "Bye" },
      targets: { de: { a: "Hallo X", b: "Tschuess X" } },
      lock: { de: { a: "hash-of-the-old-source", b: contentHash(entryOf("b", "Bye")) } },
    });

    const result = await preview(p, "X", "Y");

    expect(result.entries.map((entry) => [entry.key, entry.status])).toEqual([
      ["a", "stale-source"],
      ["b", "ready"],
    ]);
    expect(result.counts["stale-source"]).toBe(1);
  });

  it("checks a stale key against the current source, so a new placeholder refuses it", async () => {
    const p = await project({
      source: { a: "Hello {{name}}" },
      targets: { de: { a: "Hallo X" } },
      lock: { de: { a: "hash-of-the-old-source" } },
    });

    const result = await preview(p, "X", "Y");

    expect(result.entries[0]).toMatchObject({
      status: "gate-refused",
      reason: "placeholder",
      details: ["-{{name}}"],
    });
  });

  it("does not mark a key stale when the lock file has no baseline for it", async () => {
    const p = await project({ source: { a: "Hello" }, targets: { de: { a: "Hallo X" } } });
    const result = await preview(p, "X", "Y");
    expect(result.entries[0]?.status).toBe("ready");
    expect(result).not.toHaveProperty("baselineUnavailable");
  });

  it("says the baseline is unavailable when the lock file cannot be read, and marks nothing stale", async () => {
    const p = await project({
      source: { a: "Hello new" },
      targets: { de: { a: "Hallo X" } },
      lock: { de: { a: "hash-of-the-old-source" } },
    });
    await writeFile(join(p.dir, "verbatra.lock.json"), "{ not json", "utf8");

    const result = await preview(p, "X", "Y");

    expect(result.baselineUnavailable).toBe(true);
    expect(result.entries[0]?.status).toBe("ready");
  });

  it("does not mark a key stale when its source text is blank", async () => {
    const p = await project({
      source: { a: "   " },
      targets: { de: { a: "X" } },
      lock: { de: { a: "old" } },
    });
    expect((await preview(p, "X", "Y")).entries[0]?.status).toBe("ready");
  });

  it("reports no-source-entry for an orphaned key", async () => {
    const p = await project({
      source: { a: "Hello" },
      targets: { de: { a: "x", orphan: "Alt X" } },
    });
    const result = await preview(p, "X", "Y");
    expect(result.entries[0]).toMatchObject({ key: "orphan", status: "no-source-entry" });
  });

  it("reports no-source-entry for a plural form generated for a language with more categories", async () => {
    const p = await project({
      source: { item_one: "One thing", item_other: "Many things" },
      targets: {
        pl: {
          item_one: "Jedna rzecz X",
          item_few: "Kilka rzeczy X",
          item_many: "Wiele rzeczy X",
          item_other: "Inne rzeczy X",
        },
      },
    });

    const result = await preview(p, "X", "Y");

    expect(result.entries.map((entry) => [entry.key, entry.status])).toEqual([
      ["item_one", "ready"],
      ["item_few", "no-source-entry"],
      ["item_many", "no-source-entry"],
      ["item_other", "ready"],
    ]);
  });

  it("reports unchanged when the replacement equals the find text", async () => {
    const p = await project({ source: { a: "Hello" }, targets: { de: { a: "Hallo X" } } });
    const result = await preview(p, "X", "X");
    expect(result.entries[0]?.status).toBe("unchanged");
    expect(result.counts.unchanged).toBe(1);
  });

  it("applies the pinned status before the protected status and the gate", async () => {
    const p = await project({
      source: { a: "Hello {{n}}" },
      targets: { de: { a: "Hallo {{n}} X" } },
      provenance: { de: { a: { origin: "human", value: "Hallo {{n}} X" } } },
      config: { pinnedKeys: ["a"] },
    });
    expect((await preview(p, "X", "")).entries[0]?.status).toBe("pinned");
  });
});

describe("previewValueReplace: caps and excerpts", () => {
  it("lists at most 1,000 matched values and says it truncated", async () => {
    const keys = Array.from({ length: 1_001 }, (_, index) => `k${index}`);
    const p = await project({
      source: Object.fromEntries(keys.map((key) => [key, "Hello"])),
      targets: { de: Object.fromEntries(keys.map((key) => [key, "Hallo X"])) },
    });

    const result = await preview(p, "X", "Y");

    expect(result.entries).toHaveLength(1_000);
    expect(result.truncated).toBe(true);
    expect(result.counts.ready).toBe(1_000);
  });

  it("does not report truncation for exactly 1,000 matches", async () => {
    const keys = Array.from({ length: 1_000 }, (_, index) => `k${index}`);
    const p = await project({
      source: Object.fromEntries(keys.map((key) => [key, "Hello"])),
      targets: { de: Object.fromEntries(keys.map((key) => [key, "Hallo X"])) },
    });

    const result = await preview(p, "X", "Y");

    expect(result.entries).toHaveLength(1_000);
    expect(result.truncated).toBe(false);
  });

  it("stops across locales at the cap as well", async () => {
    const keys = Array.from({ length: 600 }, (_, index) => `k${index}`);
    const strings = Object.fromEntries(keys.map((key) => [key, "Hallo X"]));
    const p = await project({
      source: Object.fromEntries(keys.map((key) => [key, "Hello"])),
      targets: { de: strings, fr: strings },
    });

    const result = await preview(p, "X", "Y");

    expect(result.entries).toHaveLength(1_000);
    expect(result.truncated).toBe(true);
    expect(result.entries.filter((entry) => entry.locale === "fr")).toHaveLength(400);
  });

  it("cuts each excerpt to at most 200 characters around the first match", async () => {
    const value = `${"a".repeat(500)}NEEDLE${"b".repeat(500)}`;
    const p = await project({ source: { a: "Hello" }, targets: { de: { a: value } } });

    const result = await preview(p, "NEEDLE", "PIN");

    const entry = result.entries[0] as ValueReplacePreviewEntry;
    expect(entry.before.length).toBeLessThanOrEqual(200);
    expect(entry.after.length).toBeLessThanOrEqual(200);
    expect(entry.before).toContain("NEEDLE");
    expect(entry.after).toContain("PIN");
    expect(entry.excerptCut).toBe(true);
  });

  it("does not split a surrogate pair at either end of an excerpt", async () => {
    const value = `${"😀".repeat(150)}X${"😀".repeat(150)}`;
    const p = await project({ source: { a: "Hello" }, targets: { de: { a: value } } });

    const entry = (await preview(p, "X", "Y")).entries[0] as ValueReplacePreviewEntry;

    for (const text of [entry.before, entry.after]) {
      expect(text.length).toBeLessThanOrEqual(200);
      expect(text).not.toMatch(
        /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/u,
      );
    }
  });

  it("keeps a lone surrogate in the value as it is", async () => {
    const p = await project({
      source: { a: "Hello" },
      targets: { de: { a: "\ud800 X \udc00" } },
    });
    const entry = (await preview(p, "X", "Y")).entries[0] as ValueReplacePreviewEntry;
    expect(entry.after).toBe("\ud800 Y \udc00");
  });
});

describe("applyValueReplace: writes", () => {
  it("recomputes each value from the text on disk, gates it, writes it, and stamps the lock", async () => {
    const p = await project({
      source: { a: "Hello", b: "Bye", c: "Untouched" },
      targets: { de: { a: "Hallo X", b: "Tschuess X X", c: "Gleich" } },
    });
    const listed = await preview(p, "X", "$&");

    const result = await apply(p, "X", "$&", refsOf(listed.entries));

    expect(result.counts).toEqual({
      applied: 2,
      skipped: 0,
      refused: 0,
      changed: 0,
      "too-long": 0,
    });
    expect(await readLocale(p.dir, "de")).toEqual({
      a: "Hallo $&",
      b: "Tschuess $& $&",
      c: "Gleich",
    });
    const lock = await readLock(p.dir);
    expect(lock.locales.de).toEqual({
      a: contentHash(entryOf("a", "Hello")),
      b: contentHash(entryOf("b", "Bye")),
    });
  });

  it("returns one outcome per entry in the order given", async () => {
    const p = await project({
      source: { a: "Hello", b: "Bye" },
      targets: { de: { a: "Hallo X", b: "Tschuess X" } },
    });
    const listed = await preview(p, "X", "Y");
    const refs = [...refsOf(listed.entries)].reverse();

    const result = await apply(p, "X", "Y", refs);

    expect(result.outcomes.map((outcome) => outcome.key)).toEqual(["b", "a"]);
    expect(result.outcomes.every((outcome) => outcome.status === "applied")).toBe(true);
  });

  it("never takes a value from the caller: the hash alone selects what is rewritten", async () => {
    const p = await project({ source: { a: "Hello" }, targets: { de: { a: "Hallo X" } } });
    const listed = await preview(p, "X", "Y");
    const forged = {
      ...refsOf(listed.entries)[0],
      newValue: "attacker text",
    } as ValueReplaceEntryRef;

    await apply(p, "X", "Y", [forged]);

    expect((await readLocale(p.dir, "de")).a).toBe("Hallo Y");
  });

  it("records the actor as origin, with no provider, model or review state, and feeds the memory", async () => {
    const p = await project({
      source: { a: "Hello" },
      targets: { de: { a: "Hallo X" } },
      provenance: {
        de: {
          a: {
            origin: "machine",
            value: "Hallo X",
            extra: { provider: "deepl", model: "m", reviewState: "approved", reviewer: "Ann" },
          },
        },
      },
    });
    const listed = await preview(p, "X", "Y");

    await apply(p, "X", "Y", refsOf(listed.entries), { actor: "agent" });

    expect((await readProvenance(p.dir)).locales.de?.a).toEqual({
      origin: "agent",
      valueHash: valueHash("Hallo Y"),
    });
    const memory = await readTextFile(join(p.dir, "verbatra.cache.json"));
    expect(memory).toContain("Hallo Y");
  });

  it("replaces the origin of a ready key even when the new value has the same hash", async () => {
    const decomposed = "Café";
    const p = await project({
      source: { a: "Coffee" },
      targets: { de: { a: decomposed } },
      lock: { de: { a: contentHash(entryOf("a", "Coffee")) } },
      provenance: {
        de: { a: { origin: "machine", value: decomposed, extra: { provider: "deepl" } } },
      },
    });
    const listed = await preview(p, "é", "é");
    expect(listed.entries[0]?.status).toBe("ready");

    await apply(p, "é", "é", refsOf(listed.entries), { actor: "human" });

    expect((await readLocale(p.dir, "de")).a).toBe("Café");
    expect((await readProvenance(p.dir)).locales.de?.a).toEqual({
      origin: "human",
      valueHash: valueHash("Café"),
    });
  });

  it("writes the locale file, lock, provenance and memory once for a thousand values", async () => {
    const keys = Array.from({ length: 1_000 }, (_, index) => `k${index}`);
    const p = await project({
      source: Object.fromEntries(keys.map((key) => [key, "Hello"])),
      targets: { de: Object.fromEntries(keys.map((key) => [key, "Hallo X"])) },
    });
    const listed = await preview(p, "X", "Y");
    const writes: string[] = [];
    const fs: SdkFs = {
      ...defaultFs,
      writeFile: async (path, data) => {
        writes.push(path.slice(path.lastIndexOf("/") + 1));
        await defaultFs.writeFile(path, data);
      },
    };

    const result = await applyValueReplace(
      {
        config: p.config,
        cwd: p.dir,
        find: "X",
        replace: "Y",
        entries: refsOf(listed.entries),
        actor: "human",
      },
      { fs },
    );

    expect(result.counts.applied).toBe(1_000);
    for (const name of [
      "de.json",
      "verbatra.lock.json",
      "verbatra.provenance.json",
      "verbatra.cache.json",
    ]) {
      expect(writes.filter((written) => written === name)).toHaveLength(1);
    }
  });

  it("writes keys named like Object.prototype members as own data", async () => {
    const p = await project({ source: {}, targets: { de: {} } });
    await writeJsonFile(
      join(p.dir, "locales", "en.json"),
      JSON.parse('{"__proto__": "Hello", "constructor": "Bye", "toString": "Ho"}'),
    );
    await writeJsonFile(
      join(p.dir, "locales", "de.json"),
      JSON.parse('{"__proto__": "Hallo X", "constructor": "Tschuess X", "toString": "Ho X"}'),
    );

    const listed = await preview(p, "X", "Y");
    expect(listed.entries.map((entry) => entry.key)).toEqual([
      "__proto__",
      "constructor",
      "toString",
    ]);
    const result = await apply(p, "X", "Y", refsOf(listed.entries));

    expect(result.counts.applied).toBe(3);
    const de = JSON.parse(await readTextFile(join(p.dir, "locales", "de.json")));
    expect(Object.keys(de).sort()).toEqual(["__proto__", "constructor", "toString"]);
    expect(Object.getOwnPropertyDescriptor(de, "__proto__")?.value).toBe("Hallo Y");
    const lock = JSON.parse(await readTextFile(join(p.dir, "verbatra.lock.json")));
    expect(Object.keys(lock.locales.de).sort()).toEqual(["__proto__", "constructor", "toString"]);
    expect(Object.hasOwn({}, "polluted")).toBe(false);
  });

  it("returns an empty result for no entries and touches nothing", async () => {
    const p = await project({ source: { a: "Hello" }, targets: { de: { a: "Hallo X" } } });

    const result = await apply(p, "X", "Y", []);

    expect(result).toEqual({
      outcomes: [],
      counts: { applied: 0, skipped: 0, refused: 0, changed: 0, "too-long": 0 },
      localeFailures: [],
    });
    expect(await defaultFs.fileExists(join(p.dir, "verbatra.lock.json"))).toBe(false);
  });

  it("inserts bidi and zero-width characters from the replacement verbatim", async () => {
    const p = await project({ source: { a: "Hello" }, targets: { de: { a: "Hallo X" } } });
    const replacement = "‮Y​⁦Z﻿";
    const listed = await preview(p, "X", replacement);

    await apply(p, "X", replacement, refsOf(listed.entries));

    expect((await readLocale(p.dir, "de")).a).toBe(`Hallo ${replacement}`);
  });

  it("keeps carriage returns in a CRLF value", async () => {
    const p = await project({
      source: { a: "Hello" },
      targets: { de: { a: "Zeile 1\r\nX\r\nZeile 3" } },
    });
    const listed = await preview(p, "X", "Y");

    await apply(p, "X", "Y", refsOf(listed.entries));

    expect((await readLocale(p.dir, "de")).a).toBe("Zeile 1\r\nY\r\nZeile 3");
  });
});

describe("applyValueReplace: decided again under the lock", () => {
  it("reports changed and writes nothing when the value changed after the preview", async () => {
    const p = await project({ source: { a: "Hello" }, targets: { de: { a: "Hallo X" } } });
    const listed = await preview(p, "X", "Y");
    await writeJsonFile(join(p.dir, "locales", "de.json"), { a: "Hallo X, jetzt anders" });

    const result = await apply(p, "X", "Y", refsOf(listed.entries));

    expect(result.outcomes[0]).toMatchObject({ key: "a", status: "changed" });
    expect((await readLocale(p.dir, "de")).a).toBe("Hallo X, jetzt anders");
    expect(await defaultFs.fileExists(join(p.dir, "verbatra.lock.json"))).toBe(false);
  });

  it("reports changed for a key that is gone, and for a hash that was never listed", async () => {
    const p = await project({ source: { a: "Hello" }, targets: { de: { a: "Hallo X" } } });

    const result = await apply(p, "X", "Y", [
      { locale: "de", key: "missing", valueHash: valueHash("Hallo X") },
      { locale: "de", key: "a", valueHash: "0000000000000000" },
    ]);

    expect(result.outcomes.map((outcome) => outcome.status)).toEqual(["changed", "changed"]);
    expect((await readLocale(p.dir, "de")).a).toBe("Hallo X");
  });

  it("applies when only the Unicode normalization changed and the text still matches", async () => {
    const p = await project({ source: { a: "Coffee" }, targets: { de: { a: "Café Colour" } } });
    const listed = await preview(p, "Colour", "Color");
    await writeJsonFile(join(p.dir, "locales", "de.json"), { a: "Café Colour" });

    const result = await apply(p, "Colour", "Color", refsOf(listed.entries));

    expect(result.outcomes[0]?.status).toBe("applied");
    expect((await readLocale(p.dir, "de")).a).toBe("Café Color");
  });

  it("reports changed when only the Unicode normalization changed and the text no longer matches", async () => {
    const p = await project({ source: { a: "Coffee" }, targets: { de: { a: "Café" } } });
    const listed = await preview(p, "Café", "Tee");
    await writeJsonFile(join(p.dir, "locales", "de.json"), { a: "Café" });

    const result = await apply(p, "Café", "Tee", refsOf(listed.entries));

    expect(result.outcomes[0]?.status).toBe("changed");
    expect((await readLocale(p.dir, "de")).a).toBe("Café");
  });

  it("applies when only the line endings changed and the text still matches", async () => {
    const p = await project({ source: { a: "Hello" }, targets: { de: { a: "eins\nX\nzwei" } } });
    const listed = await preview(p, "X", "Y");
    await writeJsonFile(join(p.dir, "locales", "de.json"), { a: "eins\r\nX\r\nzwei" });

    const result = await apply(p, "X", "Y", refsOf(listed.entries));

    expect(result.outcomes[0]?.status).toBe("applied");
    expect((await readLocale(p.dir, "de")).a).toBe("eins\r\nY\r\nzwei");
  });

  it("reports changed when only the line endings changed and the text no longer matches", async () => {
    const p = await project({ source: { a: "Hello" }, targets: { de: { a: "eins\nX" } } });
    const listed = await preview(p, "s\nX", "s Y");
    await writeJsonFile(join(p.dir, "locales", "de.json"), { a: "eins\r\nX" });

    const result = await apply(p, "s\nX", "s Y", refsOf(listed.entries));

    expect(result.outcomes[0]?.status).toBe("changed");
    expect((await readLocale(p.dir, "de")).a).toBe("eins\r\nX");
  });

  it("refuses under the lock a value the gate rejects against the current source", async () => {
    const p = await project({ source: { a: "Hello" }, targets: { de: { a: "Hallo X" } } });
    const listed = await preview(p, "X", "Y");
    await writeJsonFile(join(p.dir, "locales", "en.json"), { a: "Hello {{name}}" });

    const result = await apply(p, "X", "Y", refsOf(listed.entries));

    expect(result.outcomes[0]).toMatchObject({
      status: "refused",
      reason: "placeholder",
      details: ["-{{name}}"],
    });
    expect((await readLocale(p.dir, "de")).a).toBe("Hallo X");
    expect(await defaultFs.fileExists(join(p.dir, "verbatra.lock.json"))).toBe(false);
  });

  it("reports too-long for a replaced value above 20,000 characters under the lock", async () => {
    const p = await project({ source: { a: "Hello" }, targets: { de: { a: "Hallo Welt" } } });
    const listed = await preview(p, "Welt", "Erde");

    const result = await apply(p, "Welt", "x".repeat(20_000), refsOf(listed.entries));

    expect(result.outcomes[0]).toEqual({ locale: "de", key: "a", status: "too-long" });
    expect(result.counts).toEqual({
      applied: 0,
      skipped: 0,
      refused: 0,
      changed: 0,
      "too-long": 1,
    });
    expect((await readLocale(p.dir, "de")).a).toBe("Hallo Welt");
  });

  it("refuses a doubling replacement, an emptying one, and one inside a placeholder", async () => {
    const p = await project({
      source: { a: "Hello there", b: "Hello", c: "Hello {{name}}" },
      targets: { de: { a: "Hallo da", b: "Hallo", c: "Hallo {{name}}" } },
    });
    const hashes = Object.fromEntries(
      ["a", "b", "c"].map((key) => [
        key,
        valueHash({ a: "Hallo da", b: "Hallo", c: "Hallo {{name}}" }[key] as string),
      ]),
    );

    const doubled = await apply(p, "Hallo da", "ab".repeat(200), [
      { locale: "de", key: "a", valueHash: hashes.a as string },
    ]);
    const emptied = await apply(p, "Hallo", "", [
      { locale: "de", key: "b", valueHash: hashes.b as string },
    ]);
    const inside = await apply(p, "name", "vorname", [
      { locale: "de", key: "c", valueHash: hashes.c as string },
    ]);

    expect(doubled.outcomes[0]).toMatchObject({ status: "refused", reason: "degenerate" });
    expect(emptied.outcomes[0]).toMatchObject({ status: "refused", reason: "empty" });
    expect(inside.outcomes[0]).toMatchObject({ status: "refused", reason: "placeholder" });
    expect(await readLocale(p.dir, "de")).toEqual({
      a: "Hallo da",
      b: "Hallo",
      c: "Hallo {{name}}",
    });
  });

  it("skips a key with no source entry and a replacement that changes nothing", async () => {
    const p = await project({
      source: { a: "Hello" },
      targets: { de: { a: "Hallo X", orphan: "Alt X" } },
    });

    const result = await apply(p, "X", "X", [
      { locale: "de", key: "a", valueHash: valueHash("Hallo X") },
    ]);
    const orphan = await apply(p, "X", "Y", [
      { locale: "de", key: "orphan", valueHash: valueHash("Alt X") },
    ]);

    expect(result.outcomes[0]).toMatchObject({ status: "skipped", reason: "unchanged" });
    expect(orphan.outcomes[0]).toMatchObject({ status: "skipped", reason: "no-source-entry" });
  });

  it("skips a repeated {locale, key} after the first and writes the first once", async () => {
    const p = await project({ source: { a: "Hello" }, targets: { de: { a: "Hallo X" } } });
    const ref = { locale: "de", key: "a", valueHash: valueHash("Hallo X") };

    const result = await apply(p, "X", "Y", [ref, ref]);

    expect(result.outcomes.map((outcome) => outcome.status)).toEqual(["applied", "skipped"]);
    expect(result.outcomes[1]).toMatchObject({ reason: "duplicate-entry" });
    expect((await readLocale(p.dir, "de")).a).toBe("Hallo Y");
  });

  it("refuses an unknown locale before writing any other locale", async () => {
    const p = await project({
      source: { a: "Hello" },
      targets: { de: { a: "Hallo X" } },
    });

    await expect(
      apply(p, "X", "Y", [
        { locale: "de", key: "a", valueHash: valueHash("Hallo X") },
        { locale: "xx", key: "a", valueHash: valueHash("Hallo X") },
      ]),
    ).rejects.toMatchObject({ code: "UNKNOWN_LOCALE" });

    expect((await readLocale(p.dir, "de")).a).toBe("Hallo X");
  });

  it("refuses a corrupt provenance file before anything is written", async () => {
    const p = await project({ source: { a: "Hello" }, targets: { de: { a: "Hallo X" } } });
    await writeJsonFile(join(p.dir, "verbatra.provenance.json"), { version: 1, locales: [] });

    await expect(
      apply(p, "X", "Y", [{ locale: "de", key: "a", valueHash: valueHash("Hallo X") }]),
    ).rejects.toMatchObject({ code: "PROVENANCE_FILE_INVALID" });
    expect((await readLocale(p.dir, "de")).a).toBe("Hallo X");
  });

  it("leaves state recorded under a respelled locale where it is when the provenance file is corrupt", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, "locales"));
    await writeJsonFile(join(dir, "locales", "en.json"), { a: "Hello" });
    await writeJsonFile(join(dir, "locales", "pt-BR.json"), { a: "Ola X" });
    await writeJsonFile(join(dir, "verbatra.lock.json"), {
      version: 1,
      locales: { pt_BR: { a: "recorded" } },
    });
    await writeJsonFile(join(dir, "verbatra.provenance.json"), { version: 1, locales: [] });
    const config = baseConfig({ targetLocales: ["pt-BR"] });

    await expect(
      applyValueReplace({
        config,
        cwd: dir,
        find: "X",
        replace: "Y",
        entries: [{ locale: "pt-BR", key: "a", valueHash: valueHash("Ola X") }],
        actor: "human",
      }),
    ).rejects.toMatchObject({ code: "PROVENANCE_FILE_INVALID" });

    expect((await readLock(dir)).locales).toEqual({ pt_BR: { a: "recorded" } });
  });

  it("reports a corrupt provenance file before it waits on a held locale lock", async () => {
    const p = await project({ source: { a: "Hello" }, targets: { de: { a: "Hallo X" } } });
    await writeJsonFile(join(p.dir, "verbatra.provenance.json"), { version: 1, locales: [] });
    await mkdir(join(p.dir, ".verbatra-local", "locks"), { recursive: true });
    await writeFile(
      localeLockPath(p.dir, "de"),
      JSON.stringify({ pid: 999_999, acquiredAt: "2026-07-18T00:00:00.000Z" }),
    );

    await expect(
      apply(p, "X", "Y", [{ locale: "de", key: "a", valueHash: valueHash("Hallo X") }], {
        lockAcquireTimeoutMs: 0,
      }),
    ).rejects.toMatchObject({ code: "PROVENANCE_FILE_INVALID" });
  });

  it("refuses an invalid lock timeout before reading anything", async () => {
    const p = await project({ source: { a: "Hello" } });
    await expect(apply(p, "X", "Y", [], { lockAcquireTimeoutMs: -1 })).rejects.toMatchObject({
      code: "LOCK_TIMEOUT_INVALID",
    });
  });
});

describe("applyValueReplace: pinned and protected opt-ins", () => {
  const pinned = (): Promise<Project> =>
    project({
      source: { brand: "Brand", other: "Other" },
      targets: { de: { brand: "Marke X", other: "Anderes X" } },
      config: { pinnedKeys: ["brand"] },
    });

  const refs = (strings: Strings): ValueReplaceEntryRef[] =>
    Object.entries(strings).map(([key, value]) => ({
      locale: "de",
      key,
      valueHash: valueHash(value),
    }));

  it("skips a pinned key by default and applies the rest", async () => {
    const p = await pinned();

    const result = await apply(p, "X", "Y", refs({ brand: "Marke X", other: "Anderes X" }));

    expect(result.outcomes.map((outcome) => outcome.status)).toEqual(["skipped", "applied"]);
    expect(result.outcomes[0]).toMatchObject({ reason: "pinned" });
    expect((await readLocale(p.dir, "de")).brand).toBe("Marke X");
  });

  it("changes a pinned key for a human who opts in", async () => {
    const p = await pinned();

    const result = await apply(p, "X", "Y", refs({ brand: "Marke X" }), { includePinned: true });

    expect(result.outcomes[0]?.status).toBe("applied");
    expect((await readLocale(p.dir, "de")).brand).toBe("Marke Y");
  });

  it("never lets an agent change a pinned key, opt-in or not", async () => {
    const p = await pinned();

    const result = await apply(p, "X", "Y", refs({ brand: "Marke X" }), {
      includePinned: true,
      actor: "agent",
    });

    expect(result.outcomes[0]).toMatchObject({ status: "skipped", reason: "pinned" });
    expect((await readLocale(p.dir, "de")).brand).toBe("Marke X");
  });

  const protectedProject = (humanEdits?: "overwrite" | "protect"): Promise<Project> =>
    project({
      source: { a: "Hello", b: "Bye" },
      targets: { de: { a: "Hallo X", b: "Tschuess X" } },
      provenance: { de: { a: { origin: "human", value: "Hallo X" } } },
      config: humanEdits === undefined ? {} : { humanEdits },
    });

  it.each([undefined, "protect", "overwrite"] as const)(
    "skips a human-origin value by default under humanEdits %s",
    async (humanEdits) => {
      const p = await protectedProject(humanEdits);

      const result = await apply(p, "X", "Y", refs({ a: "Hallo X", b: "Tschuess X" }));

      expect(result.outcomes[0]).toMatchObject({ status: "skipped", reason: "protected" });
      expect(result.outcomes[1]?.status).toBe("applied");
      expect((await readLocale(p.dir, "de")).a).toBe("Hallo X");
    },
  );

  it("changes a protected value when asked to include protected values", async () => {
    const p = await protectedProject("overwrite");

    const result = await apply(p, "X", "Y", refs({ a: "Hallo X" }), { includeProtected: true });

    expect(result.outcomes[0]?.status).toBe("applied");
    expect((await readLocale(p.dir, "de")).a).toBe("Hallo Y");
  });

  it("treats every value as protected when the provenance file is from a newer verbatra", async () => {
    const p = await project({ source: { a: "Hello" }, targets: { de: { a: "Hallo X" } } });
    await writeJsonFile(join(p.dir, "verbatra.provenance.json"), { version: 99, locales: {} });

    const result = await apply(p, "X", "Y", refs({ a: "Hallo X" }));

    expect(result.outcomes[0]).toMatchObject({ status: "skipped", reason: "protected" });
  });

  it("writes a value without a record and leaves a provenance file from a newer verbatra untouched", async () => {
    const p = await project({ source: { a: "Hello" }, targets: { de: { a: "Hallo X" } } });
    const newer = { version: 99, locales: { de: { a: { origin: "future" } } } };
    await writeJsonFile(join(p.dir, "verbatra.provenance.json"), newer);

    const result = await apply(p, "X", "Y", refs({ a: "Hallo X" }), { includeProtected: true });

    expect(result.outcomes[0]).toMatchObject({ status: "applied" });
    expect((await readLocale(p.dir, "de")).a).toBe("Hallo Y");
    expect(await readJsonFile(join(p.dir, "verbatra.provenance.json"))).toEqual(newer);
  });
});

describe("applyValueReplace: stale keys", () => {
  it("keeps the old lock hash, skips the memory, and records a fresh unreviewed provenance", async () => {
    const p = await project({
      source: { a: "Hello new", b: "Bye" },
      targets: { de: { a: "Hallo X", b: "Tschuess X" } },
      lock: { de: { a: "hash-of-the-old-source" } },
      provenance: {
        de: {
          a: {
            origin: "machine",
            value: "Hallo X",
            extra: { provider: "deepl", reviewState: "approved", reviewer: "Ann" },
          },
        },
      },
    });
    const listed = await preview(p, "X", "Y");
    expect(listed.entries.map((entry) => entry.status)).toEqual(["stale-source", "ready"]);

    const result = await apply(p, "X", "Y", refsOf(listed.entries), { actor: "agent" });

    expect(result.outcomes[0]).toMatchObject({ key: "a", status: "applied", staleSource: true });
    expect(result.outcomes[1]).toMatchObject({ key: "b", status: "applied", staleSource: false });
    const lock = await readLock(p.dir);
    expect(lock.locales.de?.a).toBe("hash-of-the-old-source");
    expect(lock.locales.de?.b).toBe(contentHash(entryOf("b", "Bye")));
    const provenance = await readProvenance(p.dir);
    expect(provenance.locales.de?.a).toEqual({ origin: "agent", valueHash: valueHash("Hallo Y") });
    const memory = await readTextFile(join(p.dir, "verbatra.cache.json"));
    expect(memory).toContain("Tschuess Y");
    expect(memory).not.toContain("Hallo Y");
    const summary = await check({ config: p.config, cwd: p.dir });
    expect(summary.inSync).toBe(false);
    expect(summary.locales[0]).toMatchObject({ stale: 1, upToDate: 1, missing: 0 });
  });

  it("writes no memory file at all when every applied key is stale", async () => {
    const p = await project({
      source: { a: "Hello new" },
      targets: { de: { a: "Hallo X" } },
      lock: { de: { a: "hash-of-the-old-source" } },
    });
    const listed = await preview(p, "X", "Y");

    await apply(p, "X", "Y", refsOf(listed.entries));

    expect(await defaultFs.fileExists(join(p.dir, "verbatra.cache.json"))).toBe(false);
  });

  it("leaves the key reported as stale by a later preview", async () => {
    const p = await project({
      source: { a: "Hello new" },
      targets: { de: { a: "Hallo X Y" } },
      lock: { de: { a: "hash-of-the-old-source" } },
    });
    const listed = await preview(p, "X", "Z");
    await apply(p, "X", "Z", refsOf(listed.entries), { actor: "agent" });

    const after = await preview(p, "Z", "W");

    expect(after.entries[0]?.status).toBe("stale-source");
    const summary = await check({ config: p.config, cwd: p.dir });
    expect(summary.locales[0]).toMatchObject({ stale: 1, upToDate: 0 });
  });
});

describe("applyValueReplace: ICU and markup", () => {
  const icu = (strings: ProjectOptions["source"], target: ProjectOptions["source"]) =>
    project({
      source: strings,
      targets: { de: target },
      config: { format: "next-intl-json" },
    });

  it("refuses a find inside a plural keyword, a placeholder name, and a tag name", async () => {
    const p = await icu(
      {
        count: "{count, plural, one {# item} other {# items}}",
        greet: "Hello {name}",
      },
      {
        count: "{count, plural, one {# Eintrag} other {# Eintraege}}",
        greet: "Hallo {name}",
      },
    );
    const html = await project({
      source: { bold: "<b>Hi</b>" },
      targets: { de: { bold: "<b>Hallo</b>" } },
    });

    const plural = await preview(p, "plural", "select");
    const name = await preview(p, "name", "vorname");
    const tag = await preview(html, "b>", "i>");

    expect(plural.entries.find((entry) => entry.key === "count")).toMatchObject({
      status: "gate-refused",
    });
    expect(name.entries.find((entry) => entry.key === "greet")).toMatchObject({
      status: "gate-refused",
      reason: "placeholder",
    });
    expect(tag.entries.find((entry) => entry.key === "bold")).toMatchObject({
      status: "gate-refused",
      reason: "markup",
    });
  });

  it("refuses a find inside an ICU branch arm keyword", async () => {
    const p = await icu(
      { count: "{count, plural, one {# item} other {# items}}" },
      { count: "{count, plural, one {# Eintrag} other {# Eintraege}}" },
    );

    const result = await preview(p, "one", "xyz");

    expect(result.entries[0]).toMatchObject({ status: "gate-refused", reason: "icu" });
  });

  it("applies a find inside ordinary text of an ICU arm", async () => {
    const p = await icu(
      { count: "{count, plural, one {# item} other {# items}}" },
      { count: "{count, plural, one {# Eintrag} other {# Eintraege}}" },
    );
    const listed = await preview(p, "Eintrag", "Posten");
    expect(listed.entries[0]?.status).toBe("ready");

    await apply(p, "Eintrag", "Posten", refsOf(listed.entries));

    expect(JSON.parse(await readTextFile(join(p.dir, "locales", "de.json"))).count).toBe(
      "{count, plural, one {# Posten} other {# Eintraege}}",
    );
  });

  describe("a replacement that changes what an ICU argument does", () => {
    const cases = [
      {
        name: "drops the # of a plural arm",
        source: "{n, plural, one {# item} other {# items}}",
        target: "{n, plural, one {# Stueck} other {# Stuecke}}",
        find: "#",
        replace: "",
        details: ["-#:>n:one", "-#:>n:other"],
      },
      {
        name: "changes the currency of a number skeleton",
        source: "{n, number, ::currency/USD}",
        target: "{n, number, ::currency/USD}",
        find: "USD",
        replace: "EUR",
        details: [/^\+number:n:::/, /^-number:n:::/],
      },
      {
        name: "changes the style of a date",
        source: "{d, date, short}",
        target: "{d, date, short}",
        find: "short",
        replace: "full",
        details: ["+date:d:full", "-date:d:short"],
      },
    ];

    it.each(cases)(
      "refuses a replacement that $name, in the preview and under the lock",
      async (c) => {
        const p = await icu({ a: c.source }, { a: c.target });

        const listed = await preview(p, c.find, c.replace);
        const result = await apply(p, c.find, c.replace, [
          { locale: "de", key: "a", valueHash: valueHash(c.target) },
        ]);

        expect(listed.entries[0]).toMatchObject({ status: "gate-refused", reason: "icu" });
        expect(listed.entries[0]?.details).toEqual(
          c.details.map((detail) =>
            typeof detail === "string" ? detail : expect.stringMatching(detail),
          ),
        );
        expect(result.outcomes[0]).toMatchObject({ status: "refused", reason: "icu" });
        expect(result.counts.refused).toBe(1);
        expect((await readLocale(p.dir, "de")).a).toBe(c.target);
      },
    );

    it("leaves a format that is not ICU alone", async () => {
      const p = await project({
        source: { a: "Total {n, number, ::currency/USD}" },
        targets: { de: { a: "Summe {n, number, ::currency/USD}" } },
      });

      const listed = await preview(p, "USD", "EUR");

      expect(listed.entries[0]?.status).toBe("ready");
    });
  });
});
