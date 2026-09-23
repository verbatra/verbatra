import { chmod, mkdir, readdir, readFile, symlink, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CACHE_FILE_NAME } from "../../cache/translation-memory.js";
import { CONFIG_SEARCH_PLACES } from "../../config/load-config.js";
import type { VerbatraConfig } from "../../config/schema.js";
import { defaultFs, type SdkFs } from "../../fs.js";
import { LOCK_FILE_NAME } from "../../lock/lock-file.js";
import { baseConfig, makeTempDir } from "../../test-support.js";
import { exportTmx } from "./export-tmx.js";

const PROTECTED_MARKER = "the bytes that were here before the export\n";

const lockedDirectories: string[] = [];

afterEach(async () => {
  for (const directory of lockedDirectories.splice(0)) {
    await chmod(directory, 0o700);
  }
});

const cfg = (overrides: Partial<VerbatraConfig> = {}): VerbatraConfig =>
  baseConfig({ sourceLocale: "en", targetLocales: ["de", "fr"], ...overrides });

async function seed(): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"), { recursive: true });
  for (const name of [
    "locales/en.json",
    "locales/de.json",
    "locales/fr.json",
    LOCK_FILE_NAME,
    CACHE_FILE_NAME,
    ...CONFIG_SEARCH_PLACES,
    "custom.config.mjs",
  ]) {
    await writeFile(join(dir, name), PROTECTED_MARKER, "utf8");
  }
  return dir;
}

async function refusalCode(dir: string, out: string, configPath?: string): Promise<unknown> {
  try {
    await exportTmx({
      config: cfg(),
      cwd: dir,
      out,
      ...(configPath !== undefined ? { configPath } : {}),
    });
    return undefined;
  } catch (error) {
    return (error as { code?: unknown }).code;
  }
}

function readCountingFs(): { readonly fs: SdkFs; readonly reads: () => number } {
  let reads = 0;
  return {
    fs: {
      ...defaultFs,
      readFileBounded: async (path, maxBytes) => {
        reads += 1;
        return defaultFs.readFileBounded(path, maxBytes);
      },
    },
    reads: () => reads,
  };
}

describe("exportTmx: an output path outside the working directory", () => {
  it.each(["../escaped.tmx", "sub/../../escaped.tmx", ".", "sub/..", "", "   "])(
    "refuses %j with TMX_OUTPUT_CONFLICT before the memory is read",
    async (out) => {
      const dir = await seed();
      const counting = readCountingFs();

      await expect(
        exportTmx({ config: cfg(), cwd: join(dir, "locales"), out }, { fs: counting.fs }),
      ).rejects.toMatchObject({ code: "TMX_OUTPUT_CONFLICT" });
      expect(counting.reads()).toBe(0);
      expect(await readdir(dir)).not.toContain("escaped.tmx");
    },
  );

  it.each(["out/", "memory.tmx/", `out${sep}`])(
    "refuses %j, which ends in a path separator and so names no file",
    async (out) => {
      const dir = await seed();

      await expect(exportTmx({ config: cfg(), cwd: dir, out })).rejects.toMatchObject({
        code: "TMX_OUTPUT_CONFLICT",
        message: expect.stringContaining("names no file."),
      });
      expect(await readdir(dir)).not.toContain("memory.tmx");
      expect(await readdir(dir)).not.toContain("out");
    },
  );

  it("refuses an absolute path outside the working directory", async () => {
    const dir = await seed();
    const outside = await makeTempDir();

    expect(await refusalCode(dir, join(outside, "memory.tmx"))).toBe("TMX_OUTPUT_CONFLICT");
    expect(await readdir(outside)).toEqual([]);
  });

  it("names the refused path and how to pick one that is accepted", async () => {
    const dir = await seed();

    await expect(exportTmx({ config: cfg(), cwd: dir, out: "../escaped.tmx" })).rejects.toThrow(
      /"\.\.\/escaped\.tmx" is not inside the working directory\. Pass a path naming a file inside/,
    );
  });

  it("accepts an absolute path that stays inside the working directory", async () => {
    const dir = await seed();

    const result = await exportTmx({ config: cfg(), cwd: dir, out: join(dir, "out", "m.tmx") });

    expect(result.path).toBe(join(dir, "out", "m.tmx"));
    expect(await readFile(result.path, "utf8")).toContain("<tmx");
  });

  it("accepts a directory whose name merely starts with two dots", async () => {
    const dir = await seed();

    const result = await exportTmx({ config: cfg(), cwd: dir, out: "..exports/memory.tmx" });

    expect(result.path).toBe(resolve(dir, "..exports", "memory.tmx"));
  });
});

const RESERVED_NAMES: readonly string[] = [
  "locales/en.json",
  "locales/de.json",
  "locales/fr.json",
  LOCK_FILE_NAME,
  CACHE_FILE_NAME,
  ...CONFIG_SEARCH_PLACES,
];

describe("exportTmx: an output path naming a project file", () => {
  it.each(RESERVED_NAMES)("refuses %s and leaves its bytes untouched", async (name) => {
    const dir = await seed();

    expect(await refusalCode(dir, name)).toBe("TMX_OUTPUT_CONFLICT");
    expect(await readFile(join(dir, name), "utf8")).toBe(PROTECTED_MARKER);
  });

  it.each([
    "./verbatra.lock.json",
    "sub/../locales/de.json",
    "LOCALES/DE.JSON",
    "Verbatra.Config.TS",
  ])("refuses %s, a reserved file spelled another way", async (out) => {
    const dir = await seed();

    expect(await refusalCode(dir, out)).toBe("TMX_OUTPUT_CONFLICT");
  });

  it("refuses the configuration file the run loaded, even under a name verbatra does not search for", async () => {
    const dir = await seed();

    expect(await refusalCode(dir, "custom.config.mjs", "custom.config.mjs")).toBe(
      "TMX_OUTPUT_CONFLICT",
    );
    expect(await readFile(join(dir, "custom.config.mjs"), "utf8")).toBe(PROTECTED_MARKER);
  });

  it("refuses the glossary file the config names, and leaves its bytes untouched", async () => {
    const dir = await seed();
    await writeFile(join(dir, "glossary.json"), PROTECTED_MARKER, "utf8");

    await expect(
      exportTmx({
        config: cfg(),
        cwd: dir,
        out: "Glossary.JSON",
        glossaryPath: join(dir, "glossary.json"),
      }),
    ).rejects.toMatchObject({
      code: "TMX_OUTPUT_CONFLICT",
      message: expect.stringContaining("is the glossary file the config names."),
    });
    expect(await readFile(join(dir, "glossary.json"), "utf8")).toBe(PROTECTED_MARKER);
  });

  it("writes that same name when it is not the loaded configuration", async () => {
    const dir = await seed();

    const result = await exportTmx({ config: cfg(), cwd: dir, out: "custom.config.mjs" });

    expect(await readFile(result.path, "utf8")).toContain("<tmx");
  });

  it("names what the refused path would have overwritten", async () => {
    const dir = await seed();

    await expect(exportTmx({ config: cfg(), cwd: dir, out: CACHE_FILE_NAME })).rejects.toThrow(
      /is the translation-memory cache\./,
    );
  });
});

describe("exportTmx: an output path that reaches through a symbolic link", () => {
  it("refuses a linked directory pointing into the locales and leaves the locale file untouched", async () => {
    const dir = await seed();
    await symlink(join(dir, "locales"), join(dir, "linked"), "dir");

    await expect(
      exportTmx({ config: cfg(), cwd: dir, out: "linked/de.json" }),
    ).rejects.toMatchObject({
      code: "TMX_OUTPUT_CONFLICT",
      message: expect.stringContaining(
        'resolves to the locale file for "de" through a symbolic link.',
      ),
    });
    expect(await readFile(join(dir, "locales", "de.json"), "utf8")).toBe(PROTECTED_MARKER);
  });

  it("refuses a linked directory pointing outside the working directory and writes nothing there", async () => {
    const dir = await seed();
    const outside = await makeTempDir();
    await symlink(outside, join(dir, "away"), "dir");

    await expect(
      exportTmx({ config: cfg(), cwd: dir, out: "away/nested/memory.tmx" }),
    ).rejects.toMatchObject({
      code: "TMX_OUTPUT_CONFLICT",
      message: expect.stringContaining(
        "resolves outside the working directory through a symbolic link.",
      ),
    });
    expect(await readdir(outside)).toEqual([]);
  });

  it("refuses a linked file pointing at the lock file", async () => {
    const dir = await seed();
    await symlink(join(dir, LOCK_FILE_NAME), join(dir, "memory.tmx"), "file");

    expect(await refusalCode(dir, "memory.tmx")).toBe("TMX_OUTPUT_CONFLICT");
    expect(await readFile(join(dir, LOCK_FILE_NAME), "utf8")).toBe(PROTECTED_MARKER);
  });

  it("writes through a linked directory that stays inside the working directory", async () => {
    const dir = await seed();
    await mkdir(join(dir, "exports"));
    await symlink(join(dir, "exports"), join(dir, "latest"), "dir");

    const result = await exportTmx({ config: cfg(), cwd: dir, out: "latest/memory.tmx" });

    expect(await readFile(join(dir, "exports", "memory.tmx"), "utf8")).toContain("<tmx");
    expect(result.path).toBe(join(dir, "latest", "memory.tmx"));
  });
});

describe("exportTmx: a write that fails", () => {
  it("reports TMX_UNWRITABLE naming the file and the file-system code for a read-only directory", async () => {
    const dir = await seed();
    const locked = join(dir, "locked");
    await mkdir(locked);
    await chmod(locked, 0o500);
    lockedDirectories.push(locked);

    const failure = exportTmx({ config: cfg(), cwd: dir, out: "locked/memory.tmx" });

    await expect(failure).rejects.toMatchObject({ code: "TMX_UNWRITABLE" });
    await expect(failure).rejects.toThrow(
      /^Could not write the TMX file locked\/memory\.tmx \((EACCES|EPERM)\)\./,
    );
  });

  it("reports TMX_UNWRITABLE when a directory already sits at the output path", async () => {
    const dir = await seed();
    await mkdir(join(dir, "memory.tmx"));

    await expect(exportTmx({ config: cfg(), cwd: dir, out: "memory.tmx" })).rejects.toMatchObject({
      code: "TMX_UNWRITABLE",
    });
  });

  it("reports TMX_UNWRITABLE when the output directory cannot be created", async () => {
    const dir = await seed();
    const fs: SdkFs = {
      ...defaultFs,
      mkdir: async () => {
        throw Object.assign(new Error("no space"), { code: "ENOSPC" });
      },
    };

    await expect(
      exportTmx({ config: cfg(), cwd: dir, out: "out/memory.tmx" }, { fs }),
    ).rejects.toThrow(/^Could not write the TMX file out\/memory\.tmx \(ENOSPC\)\. The device/);
  });
});
