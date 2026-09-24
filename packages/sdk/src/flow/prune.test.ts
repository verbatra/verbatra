import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import {
  baseConfig,
  makeStubProvider,
  makeTempDir,
  readJsonFile,
  readTextFile,
  writeJsonFile,
} from "../test-support.js";
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
  baseConfig({ targetLocales: ["de"], ...overrides });

describe("translate: orphan pruning (--prune)", () => {
  it("removes the orphaned key from the written file when prune is on", async () => {
    const dir = await project({ greeting: "Hello" }, { de: { greeting: "Hallo", stale: "Alt" } });

    const summary = await translate(
      { config: cfg(), cwd: dir, prune: true },
      { createProvider: () => makeStubProvider().provider },
    );

    expect(summary.locales[0]?.orphaned).toEqual(["stale"]);
    expect(summary.locales[0]?.pruned).toEqual(["stale"]);
    const de = (await readJsonFile(targetPath(dir, "de"))) as Record<string, string>;
    expect(de.stale).toBeUndefined();
    expect(de.greeting).toBe("Hallo");
  });

  it("leaves the orphaned key in place and reports it when prune is off (default)", async () => {
    const dir = await project({ greeting: "Hello" }, { de: { greeting: "Hallo", stale: "Alt" } });

    const summary = await translate(
      { config: cfg(), cwd: dir },
      { createProvider: () => makeStubProvider().provider },
    );

    expect(summary.locales[0]?.orphaned).toEqual(["stale"]);
    expect(summary.locales[0]?.pruned).toEqual([]);
    const de = (await readJsonFile(targetPath(dir, "de"))) as Record<string, string>;
    expect(de.stale).toBe("Alt");
  });

  it("the config option alone enables pruning (no flag passed)", async () => {
    const dir = await project({ greeting: "Hello" }, { de: { greeting: "Hallo", stale: "Alt" } });

    const summary = await translate(
      { config: cfg({ prune: true }), cwd: dir },
      { createProvider: () => makeStubProvider().provider },
    );

    expect(summary.locales[0]?.pruned).toEqual(["stale"]);
    const de = (await readJsonFile(targetPath(dir, "de"))) as Record<string, string>;
    expect(de.stale).toBeUndefined();
  });

  it("the CLI flag overrides the config option (flag false-by-absence does not, but flag true wins)", async () => {
    const dir = await project({ greeting: "Hello" }, { de: { greeting: "Hallo", stale: "Alt" } });

    const summary = await translate(
      { config: cfg({ prune: false }), cwd: dir, prune: true },
      { createProvider: () => makeStubProvider().provider },
    );
    expect(summary.locales[0]?.pruned).toEqual(["stale"]);
    const de = (await readJsonFile(targetPath(dir, "de"))) as Record<string, string>;
    expect(de.stale).toBeUndefined();
  });

  it("never removes source-present keys: missing, changed, unchanged, and integrity-withheld survive", async () => {
    const dir = await project(
      { u: "U", f: "F", m: "M" },
      { de: { u: "[de] U", f: "[de] F-old", orphan: "Orphan" } },
    );
    await translate(
      { config: cfg(), cwd: dir },
      { createProvider: () => makeStubProvider().provider },
    );

    await writeJsonFile(join(dir, "locales", "en.json"), { u: "U", f: "F-new", m: "M" });
    const failing = makeStubProvider({ failIntegrity: new Set(["f"]) });

    const summary = await translate(
      { config: cfg(), cwd: dir, prune: true },
      { createProvider: () => failing.provider },
    );

    expect(summary.locales[0]?.pruned).toEqual(["orphan"]);
    expect(summary.locales[0]?.integrityMismatches).toEqual(["f"]);
    const de = (await readJsonFile(targetPath(dir, "de"))) as Record<string, string>;
    expect(de.orphan).toBeUndefined();
    expect(de.u).toBeDefined();
    expect(de.f).toBeDefined();
    expect(de.m).toBeDefined();
  });

  it("dry-run with prune reports the prune set and writes neither the file nor the lock", async () => {
    const dir = await project({ greeting: "Hello" }, { de: { greeting: "Hallo", stale: "Alt" } });
    const beforeFile = await readTextFile(targetPath(dir, "de"));

    const summary = await translate({ config: cfg(), cwd: dir, prune: true, dryRun: true });

    expect(summary.dryRun).toBe(true);
    expect(summary.locales[0]?.pruned).toEqual(["stale"]);
    expect(await readTextFile(targetPath(dir, "de"))).toBe(beforeFile);
    await expect(readTextFile(lockPath(dir))).rejects.toThrow();
  });

  it("the written lock-file lists no entry for a pruned key", async () => {
    const dir = await project({ greeting: "Hello" }, { de: { greeting: "Hallo", stale: "Alt" } });

    await translate(
      { config: cfg(), cwd: dir, prune: true },
      { createProvider: () => makeStubProvider().provider },
    );

    const lock = (await readJsonFile(lockPath(dir))) as LockShape;
    expect(lock.locales.de?.stale).toBeUndefined();
    expect(lock.locales.de?.greeting).toBeDefined();
  });

  it("a stale lock entry for a now-orphaned key does not survive a prune run", async () => {
    const dir = await project({ greeting: "Hello" }, { de: { greeting: "Hallo", stale: "Alt" } });
    await writeFile(
      lockPath(dir),
      `${JSON.stringify(
        { version: 1, locales: { de: { greeting: "deadbeef", stale: "leftover" } } },
        null,
        2,
      )}\n`,
      "utf8",
    );

    await translate(
      { config: cfg(), cwd: dir, prune: true },
      { createProvider: () => makeStubProvider().provider },
    );

    const lock = (await readJsonFile(lockPath(dir))) as LockShape;
    expect(lock.locales.de?.stale).toBeUndefined();
  });

  it("a no-orphan prune run produces a file identical to a non-prune run", async () => {
    const sourceObj = { a: "A", b: "B" };
    const targetObj = { a: "[de] A", b: "[de] B" };

    const dirPrune = await project(sourceObj, { de: { ...targetObj } });
    await translate(
      { config: cfg(), cwd: dirPrune, prune: true },
      { createProvider: () => makeStubProvider().provider },
    );

    const dirPlain = await project(sourceObj, { de: { ...targetObj } });
    await translate(
      { config: cfg(), cwd: dirPlain },
      { createProvider: () => makeStubProvider().provider },
    );

    expect(await readTextFile(targetPath(dirPrune, "de"))).toBe(
      await readTextFile(targetPath(dirPlain, "de")),
    );
  });

  it("running the same prune twice yields byte-identical target and lock files", async () => {
    const build = async (): Promise<{ file: string; lock: string }> => {
      const dir = await project(
        { greeting: "Hello", farewell: "Bye" },
        { de: { greeting: "Hallo", stale: "Alt" } },
      );
      await translate(
        { config: cfg(), cwd: dir, prune: true },
        { createProvider: () => makeStubProvider().provider },
      );
      await translate(
        { config: cfg(), cwd: dir, prune: true },
        { createProvider: () => makeStubProvider().provider },
      );
      return {
        file: await readTextFile(targetPath(dir, "de")),
        lock: await readTextFile(lockPath(dir)),
      };
    };

    const run1 = await build();
    const run2 = await build();
    expect(run1.file).toBe(run2.file);
    expect(run1.lock).toBe(run2.lock);
  });

  it("default safety: a run with neither flag nor config option removes nothing", async () => {
    const dir = await project({ a: "A" }, { de: { a: "[de] A", x: "X", y: "Y" } });

    const summary = await translate(
      { config: cfg(), cwd: dir },
      { createProvider: () => makeStubProvider().provider },
    );

    expect(summary.locales[0]?.pruned).toEqual([]);
    const de = (await readJsonFile(targetPath(dir, "de"))) as Record<string, string>;
    expect(de.x).toBe("X");
    expect(de.y).toBe("Y");
  });
});

describe("translate: orphan pruning on Flutter ARB", () => {
  const arbConfig = (): VerbatraConfig =>
    cfg({ format: "arb", files: { pattern: "l10n/app_{locale}.arb" } });

  async function arbProject(): Promise<string> {
    const dir = await makeTempDir();
    await mkdir(join(dir, "l10n"));
    await writeJsonFile(join(dir, "l10n", "app_en.arb"), {
      "@@locale": "en",
      greeting: "Hello",
      "@greeting": { description: "Greets" },
    });
    await writeJsonFile(join(dir, "l10n", "app_de.arb"), {
      "@@locale": "de",
      "@@last_modified": "2026-01-01T00:00:00Z",
      greeting: "Hallo",
      "@greeting": { description: "Greets" },
      stale: "Alt",
      "@stale": { description: "Gone from the source" },
    });
    return dir;
  }

  it("removes the orphaned message and its @key block, keeping @@ global metadata", async () => {
    const dir = await arbProject();

    const summary = await translate(
      { config: arbConfig(), cwd: dir, prune: true },
      { createProvider: () => makeStubProvider().provider },
    );

    expect(summary.locales[0]?.pruned).toEqual(["stale"]);
    expect(await readJsonFile(join(dir, "l10n", "app_de.arb"))).toEqual({
      "@@locale": "de",
      "@@last_modified": "2026-01-01T00:00:00Z",
      greeting: "Hallo",
      "@greeting": { description: "Greets" },
    });
  });

  it("leaves the orphaned message in place when prune is off", async () => {
    const dir = await arbProject();

    await translate(
      { config: arbConfig(), cwd: dir },
      { createProvider: () => makeStubProvider().provider },
    );

    const de = (await readJsonFile(join(dir, "l10n", "app_de.arb"))) as Record<string, unknown>;
    expect(de.stale).toBe("Alt");
  });
});
