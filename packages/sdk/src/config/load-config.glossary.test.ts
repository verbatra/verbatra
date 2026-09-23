import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { translate } from "../flow/translate-project.js";
import {
  baseConfig,
  localeGlossaryOf,
  makeFakeFs,
  makeStubProvider,
  makeTempDir,
  writeJsonFile,
} from "../test-support.js";
import { loadConfig, loadConfigWithMeta } from "./load-config.js";
import type { VerbatraConfigInput } from "./schema.js";

function configWithGlossaryPath(path: string): VerbatraConfigInput {
  return { ...baseConfig(), glossary: path };
}

describe("loadConfigWithMeta: glossary provenance", () => {
  it("records none provenance when glossary is absent", async () => {
    const loaded = await loadConfigWithMeta({ configOverride: baseConfig() });
    expect(loaded.glossary).toEqual({ source: "none" });
    expect(loaded.config.glossary).toBeUndefined();
  });

  it("records inline provenance and passes an inline record through unchanged", async () => {
    const loaded = await loadConfigWithMeta({
      configOverride: baseConfig({ glossary: { hello: "hallo" } }),
    });
    expect(loaded.glossary).toEqual({ source: "inline" });
    expect(loaded.config.glossary).toEqual({ hello: "hallo" });
  });

  it("records override source for a configOverride and resolves a glossary path against cwd", async () => {
    const dir = await makeTempDir();
    await writeJsonFile(join(dir, "glossary.json"), { hello: "hallo" });

    const loaded = await loadConfigWithMeta({
      configOverride: configWithGlossaryPath("glossary.json"),
      cwd: dir,
    });

    expect(loaded.source).toEqual({ kind: "override" });
    expect(loaded.glossary).toEqual({ source: "file", path: join(dir, "glossary.json") });
    expect(loaded.config.glossary).toEqual({ hello: "hallo" });
  });

  it("resolves a glossary path found via search against the config file's directory, not cwd", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, "nested"));
    await writeFile(
      join(dir, "nested", ".verbatrarc.json"),
      JSON.stringify(configWithGlossaryPath("glossary.json")),
      "utf8",
    );
    await writeJsonFile(join(dir, "nested", "glossary.json"), { hello: "hallo" });

    const loaded = await loadConfigWithMeta({ cwd: join(dir, "nested") });

    expect(loaded.source.kind).toBe("search");
    if (loaded.source.kind !== "override") {
      expect(loaded.source.filepath).toBe(join(dir, "nested", ".verbatrarc.json"));
    }
    expect(loaded.glossary).toEqual({ source: "file", path: join(dir, "nested", "glossary.json") });
    expect(loaded.config.glossary).toEqual({ hello: "hallo" });
  });

  it("resolves a glossary path for an explicit configPath against that file's directory", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, "explicit"));
    const configFile = join(dir, "explicit", "ci.verbatra.json");
    await writeFile(configFile, JSON.stringify(configWithGlossaryPath("glossary.json")), "utf8");
    await writeJsonFile(join(dir, "explicit", "glossary.json"), { hello: "hallo" });

    const loaded = await loadConfigWithMeta({ configPath: configFile });

    expect(loaded.source).toEqual({ kind: "explicit", filepath: configFile });
    expect(loaded.glossary).toEqual({
      source: "file",
      path: join(dir, "explicit", "glossary.json"),
    });
    expect(loaded.config.glossary).toEqual({ hello: "hallo" });
  });

  it("a glossary path resolved via configPath ignores the unrelated cwd", async () => {
    const dir = await makeTempDir();
    const configDir = join(dir, "config-dir");
    const cwdDir = join(dir, "cwd-dir");
    await mkdir(configDir);
    await mkdir(cwdDir);
    const configFile = join(configDir, "ci.verbatra.json");
    await writeFile(configFile, JSON.stringify(configWithGlossaryPath("glossary.json")), "utf8");
    await writeJsonFile(join(configDir, "glossary.json"), { hello: "hallo" });
    await writeJsonFile(join(cwdDir, "glossary.json"), { hello: "wrong" });

    const loaded = await loadConfigWithMeta({ configPath: configFile, cwd: cwdDir });

    expect(loaded.config.glossary).toEqual({ hello: "hallo" });
  });

  it("honors an injected fs seam for the glossary file read, never touching the real disk", async () => {
    const fakeFs = makeFakeFs({
      readFileBounded: async () => ({
        kind: "ok",
        content: JSON.stringify({ hello: "hallo" }),
      }),
    });

    const loaded = await loadConfigWithMeta({
      configOverride: configWithGlossaryPath("glossary.json"),
      cwd: "/never-touched",
      fs: fakeFs,
    });

    expect(loaded.config.glossary).toEqual({ hello: "hallo" });
    expect(loaded.glossary).toEqual({ source: "file", path: "/never-touched/glossary.json" });
  });

  it("records inline provenance for a config found via search", async () => {
    const dir = await makeTempDir();
    await writeFile(
      join(dir, ".verbatrarc.json"),
      JSON.stringify(baseConfig({ glossary: { hello: "hallo" } })),
      "utf8",
    );

    const loaded = await loadConfigWithMeta({ cwd: dir });

    expect(loaded.source.kind).toBe("search");
    expect(loaded.glossary).toEqual({ source: "inline" });
    expect(loaded.config.glossary).toEqual({ hello: "hallo" });
  });

  it("records inline provenance for an explicit configPath", async () => {
    const dir = await makeTempDir();
    const configFile = join(dir, "ci.verbatra.json");
    await writeFile(
      configFile,
      JSON.stringify(baseConfig({ glossary: { hello: "hallo" } })),
      "utf8",
    );

    const loaded = await loadConfigWithMeta({ configPath: configFile });

    expect(loaded.source).toEqual({ kind: "explicit", filepath: configFile });
    expect(loaded.glossary).toEqual({ source: "inline" });
    expect(loaded.config.glossary).toEqual({ hello: "hallo" });
  });

  it("a missing glossary file surfaces as CONFIG_INVALID naming the resolved path", async () => {
    const dir = await makeTempDir();
    await expect(
      loadConfigWithMeta({
        configOverride: configWithGlossaryPath("absent.json"),
        cwd: dir,
      }),
    ).rejects.toMatchObject({ code: "CONFIG_INVALID" });
  });
});

describe("loadConfig: delegates to loadConfigWithMeta unchanged", () => {
  it("returns only the resolved config, matching loadConfigWithMeta's config field", async () => {
    const dir = await makeTempDir();
    await writeJsonFile(join(dir, "glossary.json"), { hello: "hallo" });

    const config = await loadConfig({
      configOverride: configWithGlossaryPath("glossary.json"),
      cwd: dir,
    });

    expect(config.glossary).toEqual({ hello: "hallo" });
  });
});

describe("consumer-unchanged: the translation flow receives the glossary resolved per locale", () => {
  it("a config loaded with a glossary file path reaches the provider as that locale's terms", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, "locales"));
    await writeJsonFile(join(dir, "locales", "en.json"), { a: "A" });
    await writeJsonFile(join(dir, "glossary.json"), { hello: "hallo" });

    const config = await loadConfig({
      configOverride: configWithGlossaryPath("glossary.json"),
      cwd: dir,
    });

    const stub = makeStubProvider({ kind: "llm" });
    await translate({ config, cwd: dir }, { createProvider: () => stub.provider });

    expect(stub.calls[0]?.request.glossary).toEqual(localeGlossaryOf({ hello: "hallo" }));
  });
});

describe("loadConfigWithMeta: an inline version 2 glossary", () => {
  it("passes a valid version 2 glossary through as written", async () => {
    const glossary = {
      version: 2 as const,
      terms: [{ source: "Dashboard", targets: { de: "Übersicht" } }],
      doNotTranslate: ["verbatra"],
    };
    const loaded = await loadConfigWithMeta({ configOverride: baseConfig({ glossary }) });
    expect(loaded.glossary).toEqual({ source: "inline" });
    expect(loaded.config.glossary).toEqual(glossary);
  });

  it("refuses an invalid version 2 glossary as CONFIG_INVALID", async () => {
    await expect(
      loadConfigWithMeta({
        configOverride: {
          ...baseConfig(),
          glossary: {
            version: 2,
            terms: [{ source: "A", target: "B" }],
            doNotTranslate: ["A"],
          },
        },
      }),
    ).rejects.toMatchObject({ code: "CONFIG_INVALID" });
  });
});
