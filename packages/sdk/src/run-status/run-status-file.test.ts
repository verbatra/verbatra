import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { REVIEW_REASON_CODES } from "@verbatra/ai-providers";
import { describe, expect, it } from "vitest";
import type { LocaleSummary, RunSummary } from "../flow/summary.js";
import { defaultFs } from "../fs.js";
import { makeFakeFs, makeTempDir } from "../test-support.js";
import {
  buildRunStatusFile,
  readRunStatusFile,
  runStatusFilePath,
  writeRunStatusFile,
} from "./run-status-file.js";

function succeededLocale(overrides: Partial<LocaleSummary> = {}): LocaleSummary {
  return {
    locale: "de",
    status: "succeeded",
    translated: [],
    unchanged: [],
    orphaned: [],
    pruned: [],
    invalidIcuSource: [],
    cacheHits: [],
    fuzzyHits: [],
    integrityMismatches: [],
    providerFailures: [],
    generated: [],
    budgetWithheld: [],
    notices: [],
    needsReview: [],
    unfilled: [],
    malformedRows: [],
    duplicateKeys: [],
    ...overrides,
  };
}

function runSummary(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    dryRun: false,
    locales: [succeededLocale()],
    succeeded: ["de"],
    partial: [],
    failed: [],
    ...overrides,
  };
}

describe("runStatusFilePath", () => {
  it("resolves under .verbatra-local inside the given cwd", () => {
    expect(runStatusFilePath("/project")).toBe(
      join("/project", ".verbatra-local", "run-status.json"),
    );
  });
});

describe("buildRunStatusFile", () => {
  it("projects locale, status, and needsReview unchanged, omitting absent usage/budget", () => {
    const summary = runSummary({
      locales: [
        succeededLocale({
          locale: "fr",
          status: "failed",
          needsReview: [{ key: "greeting", reasons: ["EQUALS_SOURCE"] }],
        }),
      ],
    });

    const file = buildRunStatusFile(summary, "2026-01-01T00:00:00.000Z");

    expect(file).toEqual({
      version: 1,
      generatedAt: "2026-01-01T00:00:00.000Z",
      locales: [
        {
          locale: "fr",
          status: "failed",
          needsReview: [{ key: "greeting", reasons: ["EQUALS_SOURCE"] }],
        },
      ],
    });
  });

  it("includes run-wide usage and budget, and per-locale usage, exactly when present on the summary", () => {
    const summary = runSummary({
      locales: [succeededLocale({ usage: { inputTokens: 5, outputTokens: 7 } })],
      usage: { inputTokens: 5, outputTokens: 7 },
      budget: {
        maxTokens: 1000,
        behavior: "warn",
        supported: true,
        tokensUsed: 12,
        exceeded: false,
      },
    });

    const file = buildRunStatusFile(summary, "2026-01-01T00:00:00.000Z");

    expect(file.usage).toEqual({ inputTokens: 5, outputTokens: 7 });
    expect(file.budget).toEqual({
      maxTokens: 1000,
      behavior: "warn",
      supported: true,
      tokensUsed: 12,
      exceeded: false,
    });
    expect(file.locales[0]?.usage).toEqual({ inputTokens: 5, outputTokens: 7 });
  });

  it("defaults generatedAt to an ISO timestamp when not supplied", () => {
    const file = buildRunStatusFile(runSummary());
    expect(() => new Date(file.generatedAt).toISOString()).not.toThrow();
  });
});

describe("writeRunStatusFile + readRunStatusFile: round trip", () => {
  it("creates .verbatra-local when it does not exist yet, and the read matches what was written", async () => {
    const dir = await makeTempDir();
    const path = runStatusFilePath(dir);
    const file = buildRunStatusFile(runSummary(), "2026-01-01T00:00:00.000Z");

    await writeRunStatusFile(path, file, defaultFs);

    const read = await readRunStatusFile(path, defaultFs);
    expect(read).toEqual(file);
  });

  it("round-trips run-wide usage/budget and per-locale usage when all are present", async () => {
    const dir = await makeTempDir();
    const path = runStatusFilePath(dir);
    const file = buildRunStatusFile(
      runSummary({
        locales: [succeededLocale({ usage: { inputTokens: 1, outputTokens: 2 } })],
        usage: { inputTokens: 1, outputTokens: 2 },
        budget: {
          maxTokens: 10,
          behavior: "warn",
          supported: true,
          tokensUsed: 3,
          exceeded: false,
        },
      }),
      "2026-01-01T00:00:00.000Z",
    );

    await writeRunStatusFile(path, file, defaultFs);

    const read = await readRunStatusFile(path, defaultFs);
    expect(read).toEqual(file);
  });

  it("a second write overwrites the first", async () => {
    const dir = await makeTempDir();
    const path = runStatusFilePath(dir);
    await writeRunStatusFile(
      path,
      buildRunStatusFile(runSummary(), "2026-01-01T00:00:00.000Z"),
      defaultFs,
    );
    const second = buildRunStatusFile(
      runSummary({ locales: [succeededLocale({ locale: "es" })], succeeded: ["es"] }),
      "2026-01-02T00:00:00.000Z",
    );

    await writeRunStatusFile(path, second, defaultFs);

    const read = await readRunStatusFile(path, defaultFs);
    expect(read).toEqual(second);
  });

  it("writes atomically: no leftover temp file in the directory", async () => {
    const dir = await makeTempDir();
    const path = runStatusFilePath(dir);
    await writeRunStatusFile(
      path,
      buildRunStatusFile(runSummary(), "2026-01-01T00:00:00.000Z"),
      defaultFs,
    );
    const entries = await readdir(join(dir, ".verbatra-local"));
    expect(entries).toEqual(["run-status.json"]);
  });

  it("propagates a failure creating the directory (a file already occupies the path)", async () => {
    const dir = await makeTempDir();
    await writeFile(join(dir, ".verbatra-local"), "not a directory", "utf8");
    const path = runStatusFilePath(dir);

    await expect(
      writeRunStatusFile(path, buildRunStatusFile(runSummary()), defaultFs),
    ).rejects.toThrow();
  });

  it("propagates a failure from the injected fs write", async () => {
    const dir = await makeTempDir();
    const path = runStatusFilePath(dir);
    const throwingFs = makeFakeFs({
      writeFile: async () => {
        throw new Error("disk full");
      },
    });

    await expect(
      writeRunStatusFile(path, buildRunStatusFile(runSummary()), throwingFs),
    ).rejects.toThrow("disk full");
  });
});

describe("writeRunStatusFile: honors the injected fs seam", () => {
  it("creates no real directory when the fs is fully in-memory", async () => {
    const dir = await makeTempDir();
    const path = runStatusFilePath(dir);
    const written = new Map<string, string>();
    const inMemoryFs = makeFakeFs({
      writeFile: async (target: string, data: string): Promise<void> => {
        written.set(target, data);
      },
    });

    await writeRunStatusFile(path, buildRunStatusFile(runSummary()), inMemoryFs);

    expect(await readdir(dir)).toEqual([]);
    expect(written.has(path)).toBe(true);
  });

  it("routes directory creation through the injected fs when it offers mkdir", async () => {
    const dir = await makeTempDir();
    const path = runStatusFilePath(dir);
    const madeDirs: string[] = [];
    const inMemoryFs = makeFakeFs({
      mkdir: async (target: string): Promise<void> => {
        madeDirs.push(target);
      },
    });

    await writeRunStatusFile(path, buildRunStatusFile(runSummary()), inMemoryFs);

    expect(madeDirs).toEqual([join(dir, ".verbatra-local")]);
    expect(await readdir(dir)).toEqual([]);
  });
});

describe("readRunStatusFile: degrade-to-undefined cases", () => {
  it("a missing file reads as undefined", async () => {
    const dir = await makeTempDir();
    expect(await readRunStatusFile(runStatusFilePath(dir), defaultFs)).toBeUndefined();
  });

  it("invalid JSON reads as undefined", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, ".verbatra-local"));
    await writeFile(join(dir, ".verbatra-local", "run-status.json"), "{ not json", "utf8");
    expect(await readRunStatusFile(runStatusFilePath(dir), defaultFs)).toBeUndefined();
  });

  it("valid JSON with an unexpected shape reads as undefined", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, ".verbatra-local"));
    await writeFile(
      join(dir, ".verbatra-local", "run-status.json"),
      JSON.stringify({ version: 1, generatedAt: "x", locales: [{ locale: "de" }] }),
      "utf8",
    );
    expect(await readRunStatusFile(runStatusFilePath(dir), defaultFs)).toBeUndefined();
  });

  it("a schema-valid file with an unrecognized version reads as undefined", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, ".verbatra-local"));
    await writeFile(
      join(dir, ".verbatra-local", "run-status.json"),
      JSON.stringify({ version: 99, generatedAt: "x", locales: [] }),
      "utf8",
    );
    expect(await readRunStatusFile(runStatusFilePath(dir), defaultFs)).toBeUndefined();
  });

  it("a file over the size cap reads as undefined", async () => {
    const overCap = makeFakeFs({
      readFileBounded: async () => ({ kind: "too-large" as const }),
    });
    expect(await readRunStatusFile("/anywhere/run-status.json", overCap)).toBeUndefined();
  });
});

describe("run-status persisted shape: no translation content", () => {
  it("a fully populated file carries only closed enums, integers, booleans, locale/key strings, and a timestamp", () => {
    const file = buildRunStatusFile(
      runSummary({
        locales: [
          succeededLocale({
            needsReview: [{ key: "greeting", reasons: ["EQUALS_SOURCE", "PROVIDER_DEGRADED"] }],
            usage: { inputTokens: 1, outputTokens: 2 },
          }),
        ],
        usage: { inputTokens: 1, outputTokens: 2 },
        budget: {
          maxTokens: 100,
          behavior: "stop",
          supported: true,
          tokensUsed: 3,
          exceeded: false,
        },
      }),
      "2026-01-01T00:00:00.000Z",
    );

    expect(Object.keys(file).sort()).toEqual([
      "budget",
      "generatedAt",
      "locales",
      "usage",
      "version",
    ]);
    expect(typeof file.version).toBe("number");
    expect(typeof file.generatedAt).toBe("string");
    expect(Object.keys(file.usage as object).sort()).toEqual(["inputTokens", "outputTokens"]);
    expect(Object.keys(file.budget as object).sort()).toEqual([
      "behavior",
      "exceeded",
      "maxTokens",
      "supported",
      "tokensUsed",
    ]);

    const locale = file.locales[0];
    expect(Object.keys(locale as object).sort()).toEqual([
      "locale",
      "needsReview",
      "status",
      "usage",
    ]);
    const entry = locale?.needsReview[0];
    expect(Object.keys(entry as object).sort()).toEqual(["key", "reasons"]);
    expect(["succeeded", "failed"]).toContain(locale?.status);
    for (const reason of entry?.reasons ?? []) {
      expect(REVIEW_REASON_CODES).toContain(reason);
    }
  });
});

describe("run status: a fuzzy reuse reaches a tool that reads the file later", () => {
  const FUZZY_LOCALE = succeededLocale({
    fuzzyHits: [{ key: "billing", previousSource: "Your plan renews", similarity: 0.94 }],
    needsReview: [{ key: "billing", reasons: ["FUZZY_CACHE_REUSE"] }],
  });

  it("carries the review reason, so the key lands in the review queue", () => {
    const file = buildRunStatusFile(runSummary({ locales: [FUZZY_LOCALE] }));

    expect(file.locales[0]?.needsReview).toEqual([
      { key: "billing", reasons: ["FUZZY_CACHE_REUSE"] },
    ]);
  });

  it("carries the score and the earlier source, so the reuse can be judged", () => {
    const file = buildRunStatusFile(runSummary({ locales: [FUZZY_LOCALE] }));

    expect(file.locales[0]?.fuzzyHits).toEqual([
      { key: "billing", previousSource: "Your plan renews", similarity: 0.94 },
    ]);
  });

  it("round-trips both through the file", async () => {
    const dir = await makeTempDir();
    const path = runStatusFilePath(dir);
    await writeRunStatusFile(
      path,
      buildRunStatusFile(runSummary({ locales: [FUZZY_LOCALE] })),
      defaultFs,
    );

    const read = await readRunStatusFile(path, defaultFs);

    expect(read?.locales[0]?.fuzzyHits).toEqual(FUZZY_LOCALE.fuzzyHits);
    expect(read?.locales[0]?.needsReview).toEqual(FUZZY_LOCALE.needsReview);
  });

  it("reads a file written before the field existed rather than rejecting it", async () => {
    const dir = await makeTempDir();
    const path = runStatusFilePath(dir);
    await mkdir(join(dir, ".verbatra-local"), { recursive: true });
    await writeFile(
      path,
      JSON.stringify({
        version: 1,
        generatedAt: "2026-01-01T00:00:00.000Z",
        locales: [{ locale: "de", status: "succeeded", needsReview: [] }],
      }),
    );

    const read = await readRunStatusFile(path, defaultFs);

    expect(read?.locales[0]?.locale).toBe("de");
    expect(read?.locales[0]?.fuzzyHits).toBeUndefined();
  });

  it("omits the field entirely for a locale with no fuzzy reuse", () => {
    const file = buildRunStatusFile(runSummary({ locales: [succeededLocale()] }));

    expect(file.locales[0]).not.toHaveProperty("fuzzyHits");
  });
});

describe("readRunStatusFile: every review reason code survives a round trip", () => {
  it("enumerates a non-trivial code list, so the per-code check cannot pass vacuously", () => {
    expect(REVIEW_REASON_CODES.length).toBeGreaterThanOrEqual(6);
  });

  it.each(REVIEW_REASON_CODES)("reads back a file whose only reason is %s", async (reason) => {
    const dir = await makeTempDir();
    const path = runStatusFilePath(dir);
    await mkdir(join(dir, ".verbatra-local"));
    await writeFile(
      path,
      JSON.stringify({
        version: 1,
        generatedAt: "2026-01-01T00:00:00.000Z",
        usage: { inputTokens: 120, outputTokens: 80 },
        locales: [
          {
            locale: "de",
            status: "succeeded",
            needsReview: [{ key: "greeting", reasons: [reason] }],
          },
        ],
      }),
      "utf8",
    );

    const file = await readRunStatusFile(path, defaultFs);

    expect(file?.usage).toEqual({ inputTokens: 120, outputTokens: 80 });
    expect(file?.locales[0]?.needsReview).toEqual([{ key: "greeting", reasons: [reason] }]);
  });
});
