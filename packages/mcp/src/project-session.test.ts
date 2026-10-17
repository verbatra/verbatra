import { rm, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { SdkError, type SdkFs } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import { type McpProjectState, openProjectSession } from "./project-session.js";
import { makeTempDir, nodeFs, writeJsonFile } from "./test-support.js";

const VALID_CONFIG = {
  sourceLocale: "en",
  targetLocales: ["de"],
  format: "i18next-json",
  files: { pattern: "locales/{locale}.json" },
  provider: { id: "none" },
};

function errorCode(state: McpProjectState): string | undefined {
  return state.kind === "unconfigured" && state.error instanceof SdkError
    ? state.error.code
    : undefined;
}

function targetLocales(state: McpProjectState): readonly string[] | undefined {
  return state.kind === "configured" ? state.loaded.config.targetLocales : undefined;
}

async function bumpMtime(path: string, secondsAhead: number): Promise<void> {
  const when = new Date(Date.now() + secondsAhead * 1000);
  await utimes(path, when, when);
}

describe("openProjectSession", () => {
  it("starts unconfigured in an empty directory and logs the config error once", async () => {
    const dir = await makeTempDir();
    const lines: string[] = [];

    const session = await openProjectSession({ cwd: dir, onLog: (line) => lines.push(line) });
    const first = await session.current();
    const second = await session.current();

    expect(errorCode(session.latest())).toBe("CONFIG_NOT_FOUND");
    expect(errorCode(first)).toBe("CONFIG_NOT_FOUND");
    expect(errorCode(second)).toBe("CONFIG_NOT_FOUND");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^Running without a usable project config: CONFIG_NOT_FOUND: /);
  });

  it("loads a config written after startup on the next call, without a restart", async () => {
    const dir = await makeTempDir();
    const lines: string[] = [];
    const session = await openProjectSession({ cwd: dir, onLog: (line) => lines.push(line) });

    await writeJsonFile(join(dir, ".verbatrarc.json"), VALID_CONFIG);
    const state = await session.current();

    expect(targetLocales(state)).toEqual(["de"]);
    expect(lines.at(-1)).toBe("Loaded the project config from .verbatrarc.json");
  });

  it("reloads an edited config and keeps the loaded state while nothing changed", async () => {
    const dir = await makeTempDir();
    const configPath = join(dir, ".verbatrarc.json");
    await writeJsonFile(configPath, VALID_CONFIG);
    const lines: string[] = [];
    const session = await openProjectSession({ cwd: dir, onLog: (line) => lines.push(line) });

    const unchanged = await session.current();
    expect(unchanged).toBe(session.latest());
    expect(lines).toEqual([]);

    await writeJsonFile(configPath, { ...VALID_CONFIG, targetLocales: ["de", "fr"] });
    await bumpMtime(configPath, 5);

    expect(targetLocales(await session.current())).toEqual(["de", "fr"]);
    expect(lines).toEqual(["Loaded the project config from .verbatrarc.json"]);
  });

  it("drops to unconfigured when an edit makes the config invalid, and recovers once fixed", async () => {
    const dir = await makeTempDir();
    const configPath = join(dir, ".verbatrarc.json");
    await writeJsonFile(configPath, VALID_CONFIG);
    const lines: string[] = [];
    const session = await openProjectSession({ cwd: dir, onLog: (line) => lines.push(line) });

    await writeJsonFile(configPath, { ...VALID_CONFIG, format: 42 });
    await bumpMtime(configPath, 5);
    const broken = await session.current();
    await session.current();

    expect(errorCode(broken)).toBe("CONFIG_INVALID");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/CONFIG_INVALID/);

    await writeJsonFile(configPath, VALID_CONFIG);
    expect(targetLocales(await session.current())).toEqual(["de"]);
  });

  it("starts unconfigured when the config exists but is invalid", async () => {
    const dir = await makeTempDir();
    await writeFile(join(dir, ".verbatrarc.json"), "{ not json", "utf8");

    const session = await openProjectSession({ cwd: dir });

    expect(errorCode(session.latest())).toBe("CONFIG_INVALID");
  });

  it("still rejects an explicit configPath that does not exist at startup", async () => {
    const dir = await makeTempDir();

    await expect(
      openProjectSession({ cwd: dir, configPath: join(dir, "missing.json") }),
    ).rejects.toMatchObject({ code: "CONFIG_NOT_FOUND" });
  });

  it("drops to unconfigured when an explicit config file is removed later", async () => {
    const dir = await makeTempDir();
    const configPath = join(dir, "custom.json");
    await writeJsonFile(configPath, VALID_CONFIG);
    const session = await openProjectSession({ cwd: dir, configPath });

    await rm(configPath);

    expect(errorCode(await session.current())).toBe("CONFIG_NOT_FOUND");
  });

  it("shares one reload between concurrent calls", async () => {
    const dir = await makeTempDir();
    const session = await openProjectSession({ cwd: dir });
    await writeJsonFile(join(dir, ".verbatrarc.json"), VALID_CONFIG);

    const [first, second] = await Promise.all([session.current(), session.current()]);

    expect(first).toBe(second);
    expect(first.kind).toBe("configured");
  });
});

describe("openProjectSession: glossary file changes", () => {
  async function glossaryProject(): Promise<{ dir: string; glossaryPath: string }> {
    const dir = await makeTempDir();
    const glossaryPath = join(dir, "glossary.json");
    await writeJsonFile(glossaryPath, { API: "API" });
    await writeJsonFile(join(dir, ".verbatrarc.json"), {
      ...VALID_CONFIG,
      glossary: "./glossary.json",
    });
    return { dir, glossaryPath };
  }

  function glossaryOf(state: McpProjectState): unknown {
    return state.kind === "configured" ? state.loaded.config.glossary : undefined;
  }

  it("reloads a changed glossary file read from the real file system", async () => {
    const { dir, glossaryPath } = await glossaryProject();
    const session = await openProjectSession({ cwd: dir });

    await writeJsonFile(glossaryPath, { API: "API", SDK: "SDK" });
    await bumpMtime(glossaryPath, 5);

    expect(glossaryOf(await session.current())).toEqual({ API: "API", SDK: "SDK" });
  });

  it("detects a changed glossary through an injected fs without mtimeMs by its content", async () => {
    const { dir, glossaryPath } = await glossaryProject();
    const session = await openProjectSession({ cwd: dir, fs: nodeFs });
    const before = await session.current();

    expect(await session.current()).toBe(before);
    await writeJsonFile(glossaryPath, { API: "API", CLI: "CLI" });

    expect(glossaryOf(await session.current())).toEqual({ API: "API", CLI: "CLI" });
  });

  it("detects a changed glossary through an injected fs by its mtimeMs", async () => {
    const { dir, glossaryPath } = await glossaryProject();
    let stamp = 1;
    const fs: SdkFs = {
      ...nodeFs,
      async mtimeMs(path) {
        return path === glossaryPath ? stamp : undefined;
      },
    };
    const session = await openProjectSession({ cwd: dir, fs });
    const before = await session.current();

    expect(await session.current()).toBe(before);
    await writeJsonFile(glossaryPath, { API: "API", CLI: "CLI" });
    stamp = 2;

    expect(glossaryOf(await session.current())).toEqual({ API: "API", CLI: "CLI" });
  });

  it("drops to unconfigured when the glossary file disappears", async () => {
    const { dir, glossaryPath } = await glossaryProject();
    const session = await openProjectSession({ cwd: dir, fs: nodeFs });

    await rm(glossaryPath);

    expect(errorCode(await session.current())).toBe("CONFIG_INVALID");
  });
});
