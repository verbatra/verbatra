import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import { SdkError } from "../errors.js";
import { baseConfig, makeTempDir, writeJsonFile } from "../test-support.js";
import { keyValue } from "./key-value.js";

const cfg = (overrides: Partial<VerbatraConfig> = {}): VerbatraConfig =>
  baseConfig({ targetLocales: ["de"], format: "i18next-json", ...overrides });

async function project(
  source: Record<string, unknown>,
  targets: Record<string, Record<string, unknown> | undefined> = {},
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

describe("keyValue: locale and key resolution", () => {
  it("throws UNKNOWN_LOCALE for a locale not among the configured target locales", async () => {
    const dir = await project({ greeting: "Hello" });

    await expect(
      keyValue({ config: cfg(), cwd: dir, locale: "fr", key: "greeting" }),
    ).rejects.toMatchObject({ code: "UNKNOWN_LOCALE" });
  });

  it("throws UNKNOWN_KEY for a key not present in the source resource", async () => {
    const dir = await project({ greeting: "Hello" });

    await expect(
      keyValue({ config: cfg(), cwd: dir, locale: "de", key: "missing" }),
    ).rejects.toMatchObject({ code: "UNKNOWN_KEY" });
  });

  it.each(["__proto__", "constructor", "__proto__.x"])(
    "rejects the prototype-shaped key %s as UNKNOWN_KEY, never treating it as present",
    async (key) => {
      const dir = await project({ greeting: "Hello" });

      const error = await keyValue({ config: cfg(), cwd: dir, locale: "de", key }).catch(
        (e: unknown) => e,
      );

      expect(error).toBeInstanceOf(SdkError);
      expect((error as SdkError).code).toBe("UNKNOWN_KEY");
    },
  );
});

describe("keyValue: reads", () => {
  it("returns both the current source and target value when the key exists in both", async () => {
    const dir = await project({ greeting: "Hello" }, { de: { greeting: "Hallo" } });

    const result = await keyValue({ config: cfg(), cwd: dir, locale: "de", key: "greeting" });

    expect(result).toEqual({
      source: "Hello",
      target: "Hallo",
      provenance: { origin: "unrecorded", reviewState: "unreviewed" },
    });
  });

  it("omits target entirely when the key does not yet exist in that target locale", async () => {
    const dir = await project({ greeting: "Hello" }, { de: {} });

    const result = await keyValue({ config: cfg(), cwd: dir, locale: "de", key: "greeting" });

    expect(result).toEqual({ source: "Hello" });
    expect(Object.hasOwn(result, "target")).toBe(false);
  });

  it("omits target when the target locale file does not exist at all", async () => {
    const dir = await project({ greeting: "Hello" });

    const result = await keyValue({ config: cfg(), cwd: dir, locale: "de", key: "greeting" });

    expect(result).toEqual({ source: "Hello" });
  });

  it("never writes any file: a read-only view", async () => {
    const dir = await project({ greeting: "Hello" }, { de: { greeting: "Hallo" } });

    await keyValue({ config: cfg(), cwd: dir, locale: "de", key: "greeting" });

    await expect(
      import("node:fs/promises").then((fsp) => fsp.access(join(dir, "verbatra.lock.json"))),
    ).rejects.toThrow();
  });

  it("defaults the working directory to process.cwd() when cwd is omitted", async () => {
    const dir = await project({ greeting: "Hello" }, { de: { greeting: "Hallo" } });
    const previous = process.cwd();
    try {
      process.chdir(dir);
      const result = await keyValue({ config: cfg(), locale: "de", key: "greeting" });
      expect(result).toEqual({
        source: "Hello",
        target: "Hallo",
        provenance: { origin: "unrecorded", reviewState: "unreviewed" },
      });
    } finally {
      process.chdir(previous);
    }
  });
});

describe("keyValue: source context", () => {
  async function arbProject(): Promise<string> {
    const dir = await makeTempDir();
    await mkdir(join(dir, "locales"));
    await writeJsonFile(join(dir, "locales", "en.arb"), {
      "@@locale": "en",
      greeting: "Hello",
      "@greeting": { description: "Shown on the home page" },
      farewell: "Bye",
    });
    await writeJsonFile(join(dir, "locales", "de.arb"), { "@@locale": "de", greeting: "Hallo" });
    return dir;
  }

  const arbConfig = cfg({ format: "arb", files: { pattern: "locales/{locale}.arb" } });

  it("returns the description the source file gives for the key", async () => {
    const dir = await arbProject();

    await expect(
      keyValue({ config: arbConfig, cwd: dir, locale: "de", key: "greeting" }),
    ).resolves.toMatchObject({
      source: "Hello",
      target: "Hallo",
      description: "Shown on the home page",
    });
  });

  it("leaves the description out when the source file gives none", async () => {
    const dir = await arbProject();

    const result = await keyValue({ config: arbConfig, cwd: dir, locale: "de", key: "farewell" });

    expect(result).toEqual({ source: "Bye" });
  });
});
