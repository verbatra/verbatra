import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  AdapterRegistry,
  createDefaultRegistry,
  type FormatAdapter,
} from "@verbatra/format-adapters";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import {
  baseConfig,
  makeIntegrityProvider,
  makeStubProvider,
  makeTempDir,
  writeJsonFile,
} from "../test-support.js";
import { translate } from "./translate-project.js";

function cfg(overrides: Partial<VerbatraConfig> = {}): VerbatraConfig {
  return baseConfig({ targetLocales: ["de"], ...overrides });
}

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

function spyingRegistry(): { registry: AdapterRegistry; writes: string[] } {
  const resolution = createDefaultRegistry().resolve("", { format: "i18next-json" });
  if (resolution.status !== "resolved") {
    throw new Error("the default registry did not resolve the i18next adapter");
  }
  const real = resolution.adapter;
  const writes: string[] = [];
  const adapter: FormatAdapter = {
    ...real,
    write: async (resource, path) => {
      writes.push(path);
      return real.write(resource, path);
    },
  };
  return { registry: new AdapterRegistry().register(adapter), writes };
}

describe("translate: a live run that changes nothing does not rewrite the target", () => {
  it("does not call adapter.write on a second run over a fully translated project", async () => {
    const dir = await project({ a: "A" }, { de: { a: "da" } });
    const stub = makeStubProvider();
    const { registry, writes } = spyingRegistry();

    const summary = await translate(
      { config: cfg(), cwd: dir },
      { createProvider: () => stub.provider, adapterRegistry: registry },
    );

    expect(summary.locales[0]?.translated).toEqual([]);
    expect(summary.locales[0]?.unchanged).toEqual(["a"]);
    expect(stub.calls).toHaveLength(0);
    expect(writes).toEqual([]);
  });

  it("leaves the target's inode and bytes untouched on such a run", async () => {
    const dir = await project({ a: "A" }, { de: { a: "da" } });
    const stub = makeStubProvider();
    const path = targetPath(dir, "de");
    const before = await stat(path);
    const bytesBefore = await readFile(path, "utf8");

    await translate({ config: cfg(), cwd: dir }, { createProvider: () => stub.provider });

    const after = await stat(path);
    expect(after.ino).toBe(before.ino);
    expect(await readFile(path, "utf8")).toBe(bytesBefore);
  });

  it("preserves a hand-formatted target, which a rewrite would reformat", async () => {
    const dir = await project({ a: "A" }, {});
    const handFormatted = '{\n    "a": "da"\n}\n';
    await writeFile(targetPath(dir, "de"), handFormatted);
    const stub = makeStubProvider();

    await translate({ config: cfg(), cwd: dir }, { createProvider: () => stub.provider });

    expect(await readFile(targetPath(dir, "de"), "utf8")).toBe(handFormatted);
  });

  it("still writes when a key was translated", async () => {
    const dir = await project({ a: "A", b: "B" }, { de: { a: "da" } });
    const stub = makeStubProvider();
    const { registry, writes } = spyingRegistry();

    const summary = await translate(
      { config: cfg(), cwd: dir },
      { createProvider: () => stub.provider, adapterRegistry: registry },
    );

    expect(summary.locales[0]?.translated).toEqual(["b"]);
    expect(writes).toEqual([targetPath(dir, "de")]);
  });

  it("still writes when the only change is a prune", async () => {
    const dir = await project({ a: "A" }, { de: { a: "da", gone: "weg" } });
    const stub = makeStubProvider();
    const { registry, writes } = spyingRegistry();

    const summary = await translate(
      { config: cfg(), cwd: dir, prune: true },
      { createProvider: () => stub.provider, adapterRegistry: registry },
    );

    expect(summary.locales[0]?.pruned).toEqual(["gone"]);
    expect(writes).toEqual([targetPath(dir, "de")]);
    expect(await readFile(targetPath(dir, "de"), "utf8")).not.toContain("gone");
  });

  it("skips the write when an orphan is reported but pruning is off", async () => {
    const dir = await project({ a: "A" }, { de: { a: "da", gone: "weg" } });
    const stub = makeStubProvider();
    const { registry, writes } = spyingRegistry();

    const summary = await translate(
      { config: cfg(), cwd: dir },
      { createProvider: () => stub.provider, adapterRegistry: registry },
    );

    expect(summary.locales[0]?.orphaned).toEqual(["gone"]);
    expect(writes).toEqual([]);
    expect(await readFile(targetPath(dir, "de"), "utf8")).toContain("gone");
  });

  it("still creates a target that does not exist yet, even with nothing to translate", async () => {
    const dir = await project({}, { de: undefined });
    const stub = makeStubProvider();
    const { registry, writes } = spyingRegistry();

    await translate(
      { config: cfg(), cwd: dir },
      { createProvider: () => stub.provider, adapterRegistry: registry },
    );

    expect(writes).toEqual([targetPath(dir, "de")]);
    expect(await readFile(targetPath(dir, "de"), "utf8")).toBe("{}\n");
  });
});

describe("translate: a new locale whose every key was withheld is not created", () => {
  const source = { greet: "Hello {{name}}", bye: "Bye {{name}}" };

  async function exists(path: string): Promise<boolean> {
    return stat(path).then(
      () => true,
      () => false,
    );
  }

  it("writes no target file when every translation fails the integrity gate", async () => {
    const dir = await project(source, { de: undefined });
    const { registry, writes } = spyingRegistry();

    const summary = await translate(
      { config: cfg(), cwd: dir },
      {
        createProvider: () => makeIntegrityProvider(() => "Hallo"),
        adapterRegistry: registry,
      },
    );

    expect(summary.locales[0]?.integrityMismatches).toEqual(["bye", "greet"]);
    expect(writes).toEqual([]);
    expect(await exists(targetPath(dir, "de"))).toBe(false);
  });

  it("writes no target file when every provider request fails", async () => {
    const dir = await project(source, { de: undefined });
    const stub = makeStubProvider({ throwForLocales: new Set(["de"]) });
    const { registry, writes } = spyingRegistry();

    await translate(
      { config: cfg(), cwd: dir },
      { createProvider: () => stub.provider, adapterRegistry: registry },
    );

    expect(writes).toEqual([]);
    expect(await exists(targetPath(dir, "de"))).toBe(false);
  });

  it("still creates the file with the accepted keys when only some are refused", async () => {
    const dir = await project(source, { de: undefined });
    const { registry } = spyingRegistry();

    await translate(
      { config: cfg(), cwd: dir },
      {
        createProvider: () =>
          makeIntegrityProvider((_value, key) => (key === "greet" ? "Hallo {{name}}" : "Tschüss")),
        adapterRegistry: registry,
      },
    );

    expect(JSON.parse(await readFile(targetPath(dir, "de"), "utf8"))).toEqual({
      greet: "Hallo {{name}}",
    });
  });

  it("leaves an existing target untouched when every key is refused", async () => {
    const dir = await project(source, { de: { greet: "Alt {{name}}" } });
    const before = await readFile(targetPath(dir, "de"), "utf8");
    const { registry, writes } = spyingRegistry();

    await translate(
      { config: cfg(), cwd: dir },
      {
        createProvider: () => makeIntegrityProvider(() => "Hallo"),
        adapterRegistry: registry,
      },
    );

    expect(writes).toEqual([]);
    expect(await readFile(targetPath(dir, "de"), "utf8")).toBe(before);
  });
});
