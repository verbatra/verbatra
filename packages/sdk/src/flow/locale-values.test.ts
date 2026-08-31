import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import {
  baseConfig,
  makeFakeFs,
  makeTempDir,
  realDiskReads,
  writeJsonFile,
} from "../test-support.js";
import { localeValues } from "./locale-values.js";

const cfg = (overrides: Partial<VerbatraConfig> = {}): VerbatraConfig =>
  baseConfig({ targetLocales: ["de", "fr"], format: "i18next-json", ...overrides });

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

describe("localeValues", () => {
  it("reports source and target text for every key, in configured target order", async () => {
    const dir = await project({ a: "A", b: "B" }, { de: { a: "Aa", b: "Ba" } });

    const result = await localeValues({ config: cfg({ targetLocales: ["de"] }), cwd: dir });

    expect(result).toEqual([
      {
        locale: "de",
        values: {
          a: { source: "A", target: "Aa" },
          b: { source: "B", target: "Ba" },
        },
      },
    ]);
  });

  it("omits target for a key not yet translated in that locale", async () => {
    const dir = await project({ a: "A", b: "B" }, { de: { a: "Aa" } });

    const result = await localeValues({ config: cfg({ targetLocales: ["de"] }), cwd: dir });

    expect(result[0]?.values).toEqual({
      a: { source: "A", target: "Aa" },
      b: { source: "B" },
    });
  });

  it("omits source for an orphaned key present only in the target", async () => {
    const dir = await project({ a: "A" }, { de: { a: "Aa", legacy: "old" } });

    const result = await localeValues({ config: cfg({ targetLocales: ["de"] }), cwd: dir });

    expect(result[0]?.values.legacy).toEqual({ target: "old" });
  });

  it("covers every requested target locale in one call", async () => {
    const dir = await project({ a: "A" }, { de: { a: "Aa" }, fr: { a: "Af" } });

    const result = await localeValues({ config: cfg(), cwd: dir });

    expect(result.map((entry) => entry.locale)).toEqual(["de", "fr"]);
    expect(result[0]?.values).toEqual({ a: { source: "A", target: "Aa" } });
    expect(result[1]?.values).toEqual({ a: { source: "A", target: "Af" } });
  });

  it("honors a valid locales subset and preserves config order", async () => {
    const dir = await project({ a: "A" }, { de: { a: "Aa" }, fr: { a: "Af" } });

    const result = await localeValues({ config: cfg(), cwd: dir, locales: ["fr", "de"] });

    expect(result.map((entry) => entry.locale)).toEqual(["de", "fr"]);
  });

  it("rejects an unknown requested locale with UNKNOWN_LOCALE instead of silently dropping it", async () => {
    const dir = await project({ a: "A" }, { de: { a: "Aa" }, fr: { a: "Af" } });

    await expect(
      localeValues({ config: cfg(), cwd: dir, locales: ["fr", "es"] }),
    ).rejects.toMatchObject({ code: "UNKNOWN_LOCALE" });
  });

  it("writes nothing (read-only)", async () => {
    const dir = await project({ a: "A" }, { de: { a: "Aa" } });
    const fs = makeFakeFs({
      ...realDiskReads(),
      writeFile: async () => {
        throw new Error("localeValues must not write a file");
      },
      writeBytes: async () => {
        throw new Error("localeValues must not write bytes");
      },
    });

    const result = await localeValues({ config: cfg({ targetLocales: ["de"] }), cwd: dir }, { fs });

    expect(result[0]?.locale).toBe("de");
  });

  it("defaults the working directory to process.cwd() when cwd is omitted", async () => {
    const dir = await project({ a: "A" }, { de: { a: "Aa" } });
    const previous = process.cwd();
    try {
      process.chdir(dir);
      const result = await localeValues({ config: cfg({ targetLocales: ["de"] }) });
      expect(result[0]?.values).toEqual({ a: { source: "A", target: "Aa" } });
    } finally {
      process.chdir(previous);
    }
  });

  it("throws SOURCE_UNREADABLE when the source file is absent", async () => {
    const dir = await makeTempDir();

    await expect(
      localeValues({ config: cfg({ targetLocales: ["de"] }), cwd: dir }),
    ).rejects.toMatchObject({ code: "SOURCE_UNREADABLE" });
  });

  it("throws UNKNOWN_FORMAT when no adapter is registered for the format", async () => {
    const dir = await project({ a: "A" }, { de: { a: "Aa" } });

    await expect(
      localeValues({
        config: cfg({ format: "unknown-format" as VerbatraConfig["format"] }),
        cwd: dir,
      }),
    ).rejects.toMatchObject({ code: "UNKNOWN_FORMAT" });
  });
});
