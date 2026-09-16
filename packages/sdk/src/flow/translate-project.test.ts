import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AdapterRegistry } from "@verbatra/format-adapters";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import { runStatusFilePath } from "../run-status/run-status-file.js";
import type { RunStatusFile } from "../run-status/types.js";
import {
  baseConfig,
  makeFakeFs,
  makeStubProvider,
  makeTempDir,
  readJsonFile,
  realDiskReads,
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

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

const cfg = (overrides: Partial<VerbatraConfig> = {}): VerbatraConfig =>
  baseConfig({ targetLocales: ["de"], ...overrides });

describe("translate: orchestration success", () => {
  it("translates every target locale, writing each file and updating the lock", async () => {
    const dir = await project({ a: "A" }, { de: undefined, fr: undefined });
    const stub = makeStubProvider();

    const summary = await translate(
      { config: cfg({ targetLocales: ["de", "fr"] }), cwd: dir },
      { createProvider: () => stub.provider },
    );

    expect(summary.dryRun).toBe(false);
    expect([...summary.succeeded].sort()).toEqual(["de", "fr"]);
    expect(summary.failed).toEqual([]);
    expect(await exists(targetPath(dir, "de"))).toBe(true);
    expect(await exists(targetPath(dir, "fr"))).toBe(true);

    const lock = (await readJsonFile(join(dir, "verbatra.lock.json"))) as {
      locales: Record<string, Record<string, string>>;
    };
    expect(lock.locales.de?.a).toBeDefined();
    expect(lock.locales.fr?.a).toBeDefined();
  });
});

describe("translate: dry-run", () => {
  it("never constructs the provider and writes neither the target nor the lock", async () => {
    const dir = await project({ a: "A", b: "B" }, { de: { a: "da" } });
    const summary = await translate(
      { config: cfg(), cwd: dir, dryRun: true },
      {
        createProvider: () => {
          throw new Error("provider must not be constructed in dry-run");
        },
      },
    );

    expect(summary.dryRun).toBe(true);
    expect(summary.locales[0]?.translated).toEqual(["b"]);
    const de = (await readJsonFile(targetPath(dir, "de"))) as Record<string, string>;
    expect(de).toEqual({ a: "da" });
    expect(await exists(join(dir, "verbatra.lock.json"))).toBe(false);
  });
});

describe("translate: per-locale isolation", () => {
  it("records a per-locale failure as a failed summary and continues the run", async () => {
    const dir = await project({ a: "A" }, { de: undefined, fr: undefined });
    const stub = makeStubProvider();
    const fs = makeFakeFs({
      ...realDiskReads(),
      writeFile: async (path: string, data: string) => {
        if (path.endsWith("verbatra.lock.json") && data.includes('"fr"')) {
          throw Object.assign(new Error("lock write failed"), { code: "LOCK_FILE_WRITE" });
        }
      },
    });

    const summary = await translate(
      { config: cfg({ targetLocales: ["de", "fr"] }), cwd: dir },
      { createProvider: () => stub.provider, fs },
    );

    expect(summary.succeeded).toEqual(["de"]);
    expect(summary.failed).toEqual(["fr"]);
    expect(summary.locales.find((s) => s.locale === "fr")?.error?.code).toBe("LOCK_FILE_WRITE");
  });
});

async function readRunStatusJson(dir: string): Promise<RunStatusFile> {
  return JSON.parse(await readFile(runStatusFilePath(dir), "utf8")) as RunStatusFile;
}

describe("translate: run-status persistence", () => {
  it("writes .verbatra-local/run-status.json after the loop, matching the returned RunSummary", async () => {
    const dir = await project({ a: "A" }, { de: undefined, fr: undefined });
    const stub = makeStubProvider({ usage: { inputTokens: 3, outputTokens: 4 } });

    const summary = await translate(
      { config: cfg({ targetLocales: ["de", "fr"] }), cwd: dir },
      { createProvider: () => stub.provider },
    );

    const runStatus = await readRunStatusJson(dir);
    expect(runStatus.version).toBe(1);
    expect(typeof runStatus.generatedAt).toBe("string");
    expect(runStatus.usage).toEqual(summary.usage);
    expect(runStatus.locales).toEqual(
      summary.locales.map((locale) => ({
        locale: locale.locale,
        status: locale.status,
        needsReview: locale.needsReview,
        ...(locale.usage !== undefined ? { usage: locale.usage } : {}),
      })),
    );
  });

  it("records a failed locale's status even though its needsReview is empty", async () => {
    const dir = await project({ a: "A" }, { de: undefined, fr: undefined });
    const stub = makeStubProvider();
    const fs = makeFakeFs({
      ...realDiskReads(),
      writeFile: async (path: string, data: string) => {
        if (path.endsWith("verbatra.lock.json") && data.includes('"fr"')) {
          throw new Error("lock write failed");
        }
        await writeFile(path, data, "utf8");
      },
      mkdir: async (path: string) => {
        await mkdir(path, { recursive: true });
      },
    });

    await translate(
      { config: cfg({ targetLocales: ["de", "fr"] }), cwd: dir },
      { createProvider: () => stub.provider, fs },
    );

    const runStatus = await readRunStatusJson(dir);
    const fr = runStatus.locales.find((locale) => locale.locale === "fr");
    expect(fr?.status).toBe("failed");
    expect(fr?.needsReview).toEqual([]);
    expect(Object.keys(fr as object).sort()).toEqual(["locale", "needsReview", "status"]);
  });

  it("the .verbatra-local directory is created on a project's first real run", async () => {
    const dir = await project({ a: "A" }, { de: undefined });
    const stub = makeStubProvider();

    await translate({ config: cfg(), cwd: dir }, { createProvider: () => stub.provider });

    expect(await exists(runStatusFilePath(dir))).toBe(true);
  });

  it("a dry-run leaves a pre-existing run-status.json byte-for-byte unchanged", async () => {
    const dir = await project({ a: "A" }, { de: { a: "da" } });
    const stub = makeStubProvider();
    await translate({ config: cfg(), cwd: dir }, { createProvider: () => stub.provider });
    const before = await readFile(runStatusFilePath(dir), "utf8");

    await translate(
      { config: cfg(), cwd: dir, dryRun: true },
      {
        createProvider: () => {
          throw new Error("provider must not be constructed in dry-run");
        },
      },
    );

    const after = await readFile(runStatusFilePath(dir), "utf8");
    expect(after).toBe(before);
  });

  it("a whole-run throw ahead of the loop leaves a pre-existing run-status.json byte-for-byte unchanged", async () => {
    const dir = await project({ a: "A" }, { de: { a: "da" } });
    const stub = makeStubProvider();
    await translate({ config: cfg(), cwd: dir }, { createProvider: () => stub.provider });
    const before = await readFile(runStatusFilePath(dir), "utf8");

    await expect(
      translate(
        { config: cfg(), cwd: dir },
        { createProvider: () => stub.provider, adapterRegistry: new AdapterRegistry() },
      ),
    ).rejects.toMatchObject({ code: "UNKNOWN_FORMAT" });

    const after = await readFile(runStatusFilePath(dir), "utf8");
    expect(after).toBe(before);
  });

  it("a failure writing run-status.json is caught and swallowed: the run still completes and the lock still writes", async () => {
    const dir = await project({ a: "A" }, { de: undefined });
    const stub = makeStubProvider();
    const fs = makeFakeFs({
      ...realDiskReads(),
      writeFile: async (path: string, data: string) => {
        if (path.endsWith("run-status.json")) {
          throw new Error("disk full");
        }
        await writeFile(path, data, "utf8");
      },
    });

    const summary = await translate(
      { config: cfg(), cwd: dir },
      { createProvider: () => stub.provider, fs },
    );

    expect(summary.succeeded).toEqual(["de"]);
    expect(summary.failed).toEqual([]);
    expect(await exists(join(dir, "verbatra.lock.json"))).toBe(true);
    expect(await exists(runStatusFilePath(dir))).toBe(false);
  });
});

describe("translate: whole-run failures throw", () => {
  it("throws UNKNOWN_FORMAT when no adapter is registered for the format", async () => {
    const dir = await project({ a: "A" }, { de: undefined });
    const stub = makeStubProvider();
    await expect(
      translate(
        { config: cfg(), cwd: dir },
        { createProvider: () => stub.provider, adapterRegistry: new AdapterRegistry() },
      ),
    ).rejects.toMatchObject({ code: "UNKNOWN_FORMAT" });
  });

  it("throws SOURCE_UNREADABLE when the source file is absent", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, "locales"));
    const stub = makeStubProvider();
    await expect(
      translate({ config: cfg(), cwd: dir }, { createProvider: () => stub.provider }),
    ).rejects.toMatchObject({ code: "SOURCE_UNREADABLE" });
  });

  it("throws SOURCE_INVALID when the source file cannot be parsed", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, "locales"));
    await writeFile(join(dir, "locales", "en.json"), "{ not valid json", "utf8");
    const stub = makeStubProvider();
    await expect(
      translate({ config: cfg(), cwd: dir }, { createProvider: () => stub.provider }),
    ).rejects.toMatchObject({ code: "SOURCE_INVALID" });
  });
});
