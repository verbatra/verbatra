import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { SdkErrorCode } from "../errors.js";
import { baseConfig, makeTempDir } from "../test-support.js";
import { loadConfig } from "./load-config.js";

async function expectReject(
  promise: Promise<unknown>,
  code: SdkErrorCode,
): Promise<{ code: string; message: string }> {
  try {
    await promise;
  } catch (error) {
    expect(error).toMatchObject({ name: "SdkError", code });
    return error as { code: string; message: string };
  }
  throw new Error(`expected loadConfig to reject with ${code}, but it resolved`);
}

describe("loadConfig configPath: explicit-file loading", () => {
  it("loads and validates a .json file given by configPath", async () => {
    const dir = await makeTempDir();
    const file = join(dir, "ci.verbatra.json");
    await writeFile(file, JSON.stringify(baseConfig({ sourceLocale: "en" })), "utf8");

    const config = await loadConfig({ configPath: file });

    expect(config.sourceLocale).toBe("en");
    expect(config.format).toBe("i18next-json");
  });

  it("loads a .ts file given by configPath (proves the TypeScript loader is reused, not re-implemented)", async () => {
    const dir = await makeTempDir();
    const file = join(dir, "custom.config.ts");
    await writeFile(
      file,
      `export default ${JSON.stringify(baseConfig({ targetLocales: ["fr"] }))};`,
      "utf8",
    );

    const config = await loadConfig({ configPath: file });

    expect(config.targetLocales).toEqual(["fr"]);
  });

  it("a relative configPath resolves against cwd", async () => {
    const dir = await makeTempDir();
    await writeFile(
      join(dir, "rel.json"),
      JSON.stringify(baseConfig({ targetLocales: ["nl"] })),
      "utf8",
    );

    const config = await loadConfig({ cwd: dir, configPath: "rel.json" });

    expect(config.targetLocales).toEqual(["nl"]);
  });

  it("an absolute configPath is used as given", async () => {
    const dir = await makeTempDir();
    const file = join(dir, "abs.json");
    await writeFile(file, JSON.stringify(baseConfig({ sourceLocale: "es" })), "utf8");

    const config = await loadConfig({ configPath: resolve(file) });

    expect(config.sourceLocale).toBe("es");
  });
});

describe("loadConfig configPath: failure modes (structured, secret-free)", () => {
  it("a genuinely missing configPath is CONFIG_NOT_FOUND naming the resolved path", async () => {
    const dir = await makeTempDir();
    const missing = join(dir, "absent.json");

    const error = await expectReject(loadConfig({ configPath: missing }), "CONFIG_NOT_FOUND");

    expect(error.message).toContain(missing);
  });

  it("a malformed (unparseable) configPath file is CONFIG_INVALID, never a raw error", async () => {
    const dir = await makeTempDir();
    const file = join(dir, "bad.json");
    await writeFile(file, "{ not valid json", "utf8");

    await expectReject(loadConfig({ configPath: file }), "CONFIG_INVALID");
  });

  it("a configPath file that parses but fails zod is CONFIG_INVALID", async () => {
    const dir = await makeTempDir();
    const file = join(dir, "wrong.json");
    await writeFile(file, JSON.stringify({ sourceLocale: 123 }), "utf8");

    await expectReject(loadConfig({ configPath: file }), "CONFIG_INVALID");
  });

  it("an unrecognized key in a configPath file surfaces the no-key-in-config hint", async () => {
    const dir = await makeTempDir();
    const file = join(dir, "withkey.json");
    await writeFile(
      file,
      JSON.stringify({ ...baseConfig(), apiKey: "should-not-be-here" }),
      "utf8",
    );

    const error = await expectReject(loadConfig({ configPath: file }), "CONFIG_INVALID");

    expect(error.message).toContain("API keys are read from the environment");
    expect(error.message).not.toContain("should-not-be-here");
  });

  it("an empty-but-present configPath file is CONFIG_INVALID (present, so not NOT_FOUND)", async () => {
    const dir = await makeTempDir();
    const file = join(dir, "empty.json");
    await writeFile(file, "", "utf8");

    await expectReject(loadConfig({ configPath: file }), "CONFIG_INVALID");
  });
});

describe("loadConfig configPath: precedence (configOverride > configPath > search)", () => {
  it("configOverride wins over configPath: the file is not even consulted", async () => {
    const dir = await makeTempDir();
    const wouldThrow = join(dir, "never-read.json");

    const config = await loadConfig({
      configOverride: baseConfig({ sourceLocale: "zz" }),
      configPath: wouldThrow,
    });

    expect(config.sourceLocale).toBe("zz");
  });

  it("configPath wins over search: a searchable config in cwd is not used", async () => {
    const dir = await makeTempDir();
    await writeFile(
      join(dir, ".verbatrarc.json"),
      JSON.stringify(baseConfig({ sourceLocale: "it" })),
      "utf8",
    );
    const explicit = join(dir, "explicit.json");
    await writeFile(explicit, JSON.stringify(baseConfig({ sourceLocale: "fr" })), "utf8");

    const config = await loadConfig({ cwd: dir, configPath: explicit });

    expect(config.sourceLocale).toBe("fr");
  });
});
