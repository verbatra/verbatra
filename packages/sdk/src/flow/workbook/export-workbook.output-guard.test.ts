import { mkdir, readdir, readFile, symlink, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { CACHE_FILE_NAME } from "../../cache/translation-memory.js";
import { CONFIG_SEARCH_PLACES } from "../../config/load-config.js";
import type { VerbatraConfig } from "../../config/schema.js";
import { defaultFs, type SdkFs } from "../../fs.js";
import { LOCK_FILE_NAME } from "../../lock/lock-file.js";
import { PROVENANCE_FILE_NAME } from "../../lock/provenance-file.js";
import { baseConfig, makeTempDir, writeJsonFile } from "../../test-support.js";
import { type ExportWorkbookInput, exportWorkbook } from "./export-workbook.js";

const PROTECTED_MARKER = "the bytes that were here before the export\n";

const TARGET_CONTENT = `${JSON.stringify({ greeting: "Hallo" })}\n`;

const LOCK_CONTENT = `${JSON.stringify({ version: 1, locales: {} })}\n`;

const cfg = (overrides: Partial<VerbatraConfig> = {}): VerbatraConfig =>
  baseConfig({ sourceLocale: "en", targetLocales: ["de", "fr"], ...overrides });

async function seed(): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"), { recursive: true });
  await writeJsonFile(join(dir, "locales", "en.json"), { greeting: "Hello" });
  for (const name of [
    PROVENANCE_FILE_NAME,
    CACHE_FILE_NAME,
    ...CONFIG_SEARCH_PLACES,
    "custom.config.mjs",
  ]) {
    await writeFile(join(dir, name), PROTECTED_MARKER, "utf8");
  }
  await writeFile(join(dir, LOCK_FILE_NAME), LOCK_CONTENT, "utf8");
  await writeFile(join(dir, "locales", "de.json"), TARGET_CONTENT, "utf8");
  await writeFile(join(dir, "locales", "fr.json"), TARGET_CONTENT, "utf8");
  return dir;
}

type Overrides = Omit<ExportWorkbookInput, "config" | "cwd">;

async function refusal(dir: string, overrides: Overrides): Promise<unknown> {
  try {
    await exportWorkbook({ config: cfg(), cwd: dir, ...overrides });
    return undefined;
  } catch (error) {
    return error;
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

const RESERVED_NAMES: readonly string[] = [
  "locales/en.json",
  "locales/de.json",
  "locales/fr.json",
  LOCK_FILE_NAME,
  PROVENANCE_FILE_NAME,
  CACHE_FILE_NAME,
  ...CONFIG_SEARCH_PLACES,
];

describe("exportWorkbook: an xlsx output path outside the working directory", () => {
  it.each(["../escaped.xlsx", "sub/../../escaped.xlsx", ".", "sub/..", "", "   "])(
    "refuses %j with EXPORT_OUTPUT_CONFLICT before anything is read",
    async (out) => {
      const dir = await seed();
      const counting = readCountingFs();

      await expect(
        exportWorkbook({ config: cfg(), cwd: dir, out }, { fs: counting.fs }),
      ).rejects.toMatchObject({ code: "EXPORT_OUTPUT_CONFLICT" });
      expect(counting.reads()).toBe(0);
      expect(await readdir(join(dir, ".."))).not.toContain("escaped.xlsx");
    },
  );

  it.each(["out/", "handoff.xlsx/", `out${sep}`])(
    "refuses %j, which ends in a path separator and so names no file",
    async (out) => {
      const dir = await seed();

      await expect(exportWorkbook({ config: cfg(), cwd: dir, out })).rejects.toMatchObject({
        code: "EXPORT_OUTPUT_CONFLICT",
        message: expect.stringContaining("names no file."),
      });
      expect(await readdir(dir)).not.toContain("out");
    },
  );

  it("refuses an absolute path outside the working directory and writes nothing there", async () => {
    const dir = await seed();
    const outside = await makeTempDir();

    expect(await refusal(dir, { out: join(outside, "handoff.xlsx") })).toMatchObject({
      code: "EXPORT_OUTPUT_CONFLICT",
    });
    expect(await readdir(outside)).toEqual([]);
  });

  it("names the refused path and how to pick one that is accepted", async () => {
    const dir = await seed();

    await expect(
      exportWorkbook({ config: cfg(), cwd: dir, out: "../escaped.xlsx" }),
    ).rejects.toThrow(
      /"\.\.\/escaped\.xlsx" is not inside the working directory\. Pass a path naming a file inside the working directory, or omit it to use verbatra-translations\.xlsx\./,
    );
  });

  it("accepts an absolute path that stays inside the working directory", async () => {
    const dir = await seed();

    const result = await exportWorkbook({
      config: cfg(),
      cwd: dir,
      out: join(dir, "out", "handoff.xlsx"),
    });

    expect(result.path).toBe(join(dir, "out", "handoff.xlsx"));
    expect((await readFile(result.path)).subarray(0, 2).toString("latin1")).toBe("PK");
  });

  it("accepts a directory whose name merely starts with two dots", async () => {
    const dir = await seed();

    const result = await exportWorkbook({ config: cfg(), cwd: dir, out: "..exports/h.xlsx" });

    expect(result.path).toBe(resolve(dir, "..exports", "h.xlsx"));
  });
});

describe("exportWorkbook: an xlsx output path naming a project file", () => {
  it.each(RESERVED_NAMES)("refuses %s and leaves its bytes untouched", async (name) => {
    const dir = await seed();
    const before = await readFile(join(dir, name), "utf8");

    expect(await refusal(dir, { out: name })).toMatchObject({ code: "EXPORT_OUTPUT_CONFLICT" });
    expect(await readFile(join(dir, name), "utf8")).toBe(before);
  });

  it.each(["./verbatra.lock.json", "sub/../locales/de.json", "LOCALES/DE.JSON"])(
    "refuses %s, a reserved file spelled another way",
    async (out) => {
      const dir = await seed();

      expect(await refusal(dir, { out })).toMatchObject({ code: "EXPORT_OUTPUT_CONFLICT" });
    },
  );

  it("refuses the configuration file the run loaded, even under a name verbatra does not search for", async () => {
    const dir = await seed();

    expect(
      await refusal(dir, { out: "custom.config.mjs", configPath: "custom.config.mjs" }),
    ).toMatchObject({
      code: "EXPORT_OUTPUT_CONFLICT",
      message: expect.stringContaining("is the configuration file this run loaded."),
    });
    expect(await readFile(join(dir, "custom.config.mjs"), "utf8")).toBe(PROTECTED_MARKER);
  });

  it("refuses the glossary file the config names", async () => {
    const dir = await seed();
    await writeFile(join(dir, "glossary.json"), PROTECTED_MARKER, "utf8");

    expect(
      await refusal(dir, { out: "Glossary.JSON", glossaryPath: join(dir, "glossary.json") }),
    ).toMatchObject({
      code: "EXPORT_OUTPUT_CONFLICT",
      message: expect.stringContaining("is the glossary file the config names."),
    });
    expect(await readFile(join(dir, "glossary.json"), "utf8")).toBe(PROTECTED_MARKER);
  });
});

describe("exportWorkbook: a delimited output directory", () => {
  it.each(["../escaped", "sub/../../escaped", "", "   "])(
    "refuses %j with EXPORT_OUTPUT_CONFLICT before anything is read",
    async (out) => {
      const dir = await seed();
      const counting = readCountingFs();

      await expect(
        exportWorkbook({ config: cfg(), cwd: dir, out, format: "csv" }, { fs: counting.fs }),
      ).rejects.toMatchObject({
        code: "EXPORT_OUTPUT_CONFLICT",
        message: expect.stringContaining("Pass a directory inside the working directory"),
      });
      expect(counting.reads()).toBe(0);
    },
  );

  it.each(["handoff/", `handoff${sep}`])(
    "accepts %j, a directory with a trailing separator",
    async (out) => {
      const dir = await seed();

      const result = await exportWorkbook({ config: cfg(), cwd: dir, out, format: "csv" });

      expect(result.path).toBe(join(dir, "handoff"));
      expect(await readdir(join(dir, "handoff"))).toContain("de.csv");
    },
  );

  it("writes into the working directory itself", async () => {
    const dir = await seed();

    const result = await exportWorkbook({ config: cfg(), cwd: dir, out: ".", format: "tsv" });

    expect(result.path).toBe(dir);
    expect(await readdir(dir)).toEqual(expect.arrayContaining(["de.tsv", "fr.tsv"]));
  });

  it("refuses a directory that is itself a reserved project file", async () => {
    const dir = await seed();

    expect(await refusal(dir, { out: LOCK_FILE_NAME, format: "csv" })).toMatchObject({
      code: "EXPORT_OUTPUT_CONFLICT",
      message: expect.stringContaining(`"${LOCK_FILE_NAME}" is the lock file`),
    });
    expect(await readFile(join(dir, LOCK_FILE_NAME), "utf8")).toBe(LOCK_CONTENT);
  });

  it("refuses a directory where a per-locale file would overwrite a reserved file", async () => {
    const dir = await seed();
    await mkdir(join(dir, "terms"));
    await writeFile(join(dir, "terms", "de.csv"), PROTECTED_MARKER, "utf8");

    expect(
      await refusal(dir, {
        out: "terms",
        format: "csv",
        glossaryPath: join("terms", "de.csv"),
      }),
    ).toMatchObject({
      code: "EXPORT_OUTPUT_CONFLICT",
      message: expect.stringContaining(
        '"terms" would write terms/de.csv, which is the glossary file the config names.',
      ),
    });
    expect(await readFile(join(dir, "terms", "de.csv"), "utf8")).toBe(PROTECTED_MARKER);
  });

  it("refuses a directory linked outside the working directory and writes nothing there", async () => {
    const dir = await seed();
    const outside = await makeTempDir();
    await symlink(outside, join(dir, "away"), "dir");

    expect(await refusal(dir, { out: "away", format: "csv" })).toMatchObject({
      code: "EXPORT_OUTPUT_CONFLICT",
      message: expect.stringContaining(
        "resolves outside the working directory through a symbolic link.",
      ),
    });
    expect(await readdir(outside)).toEqual([]);
  });

  it("refuses a per-locale file that is a link pointing at the lock file", async () => {
    const dir = await seed();
    await mkdir(join(dir, "handoff"));
    await symlink(join(dir, LOCK_FILE_NAME), join(dir, "handoff", "fr.csv"), "file");

    expect(await refusal(dir, { out: "handoff", format: "csv" })).toMatchObject({
      code: "EXPORT_OUTPUT_CONFLICT",
      message: expect.stringContaining(
        "would write handoff/fr.csv, which resolves to the lock file, which holds the translation baseline through a symbolic link.",
      ),
    });
    expect(await readFile(join(dir, LOCK_FILE_NAME), "utf8")).toBe(LOCK_CONTENT);
  });
});

describe("exportWorkbook: an xlsx output path that reaches through a symbolic link", () => {
  it("refuses a linked directory pointing into the locales and leaves the locale file untouched", async () => {
    const dir = await seed();
    await symlink(join(dir, "locales"), join(dir, "linked"), "dir");

    expect(await refusal(dir, { out: "linked/de.json" })).toMatchObject({
      code: "EXPORT_OUTPUT_CONFLICT",
      message: expect.stringContaining(
        'resolves to the locale file for "de" through a symbolic link.',
      ),
    });
    expect(await readFile(join(dir, "locales", "de.json"), "utf8")).toBe(TARGET_CONTENT);
  });

  it("refuses a linked directory pointing outside the working directory", async () => {
    const dir = await seed();
    const outside = await makeTempDir();
    await symlink(outside, join(dir, "away"), "dir");

    expect(await refusal(dir, { out: "away/nested/handoff.xlsx" })).toMatchObject({
      code: "EXPORT_OUTPUT_CONFLICT",
    });
    expect(await readdir(outside)).toEqual([]);
  });

  it("writes through a linked directory that stays inside the working directory", async () => {
    const dir = await seed();
    await mkdir(join(dir, "exports"));
    await symlink(join(dir, "exports"), join(dir, "latest"), "dir");

    const result = await exportWorkbook({ config: cfg(), cwd: dir, out: "latest/h.xlsx" });

    expect(result.path).toBe(join(dir, "latest", "h.xlsx"));
    expect(await readdir(join(dir, "exports"))).toEqual(["h.xlsx"]);
  });
});

const failing = (code: string): (() => Promise<never>) => {
  return async () => {
    throw Object.assign(new Error(`failed with ${code}`), { code });
  };
};

describe("exportWorkbook: a write that fails", () => {
  it("reports EXPORT_UNWRITABLE when a directory already sits at the xlsx path", async () => {
    const dir = await seed();
    await mkdir(join(dir, "handoff.xlsx"));

    await expect(
      exportWorkbook({ config: cfg(), cwd: dir, out: "handoff.xlsx" }),
    ).rejects.toMatchObject({
      code: "EXPORT_UNWRITABLE",
      message: expect.stringMatching(
        /^Could not write the handoff file handoff\.xlsx \(EISDIR\)\./,
      ),
    });
  });

  it("reports EXPORT_UNWRITABLE when the xlsx directory cannot be created", async () => {
    const dir = await seed();
    const fs: SdkFs = { ...defaultFs, mkdir: failing("EACCES") };

    await expect(
      exportWorkbook({ config: cfg(), cwd: dir, out: "out/handoff.xlsx" }, { fs }),
    ).rejects.toMatchObject({
      code: "EXPORT_UNWRITABLE",
      message: expect.stringMatching(
        /^Could not write the handoff file out\/handoff\.xlsx \(EACCES\)\. Check the write permissions/,
      ),
      cause: { code: "EACCES" },
    });
  });

  it("reports EXPORT_UNWRITABLE naming the directory when a delimited directory cannot be created", async () => {
    const dir = await seed();
    const fs: SdkFs = { ...defaultFs, mkdir: failing("EROFS") };

    await expect(
      exportWorkbook({ config: cfg(), cwd: dir, out: "handoff", format: "csv" }, { fs }),
    ).rejects.toMatchObject({
      code: "EXPORT_UNWRITABLE",
      message: expect.stringMatching(/^Could not write the handoff directory handoff \(EROFS\)\./),
    });
  });

  it("reports EXPORT_UNWRITABLE naming the per-locale file that could not be written", async () => {
    const dir = await seed();
    const fs: SdkFs = { ...defaultFs, writeFile: failing("ENOSPC") };

    await expect(
      exportWorkbook({ config: cfg(), cwd: dir, out: "handoff", format: "csv" }, { fs }),
    ).rejects.toMatchObject({
      code: "EXPORT_UNWRITABLE",
      message: expect.stringMatching(
        /^Could not write the handoff file handoff\/de\.csv \(ENOSPC\)\./,
      ),
    });
  });

  it("reports EXPORT_UNWRITABLE naming the manifest when only it could not be written", async () => {
    const dir = await seed();
    const fs: SdkFs = {
      ...defaultFs,
      writeFile: async (path, content) =>
        path.endsWith(".json") ? failing("EACCES")() : defaultFs.writeFile(path, content),
    };

    await expect(
      exportWorkbook({ config: cfg(), cwd: dir, out: "handoff", format: "tsv" }, { fs }),
    ).rejects.toMatchObject({
      code: "EXPORT_UNWRITABLE",
      message: expect.stringContaining(
        "Could not write the export manifest handoff/.verbatra-export-tsv.json (EACCES).",
      ),
    });
  });
});
