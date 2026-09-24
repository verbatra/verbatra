import { mkdir, readdir, readFile, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import { defaultFs, type SdkFs } from "../fs.js";
import { LOCK_FILE_NAME } from "../lock/lock-file.js";
import { baseConfig, makeTempDir, readJsonFile, writeJsonFile } from "../test-support.js";
import { pseudolocalize } from "./pseudo.js";

const cfg = (overrides: Partial<VerbatraConfig> = {}): VerbatraConfig =>
  baseConfig({ targetLocales: ["de"], format: "i18next-json", ...overrides });

const LOCK_CONTENT = `${JSON.stringify({ version: 1, locales: {} })}\n`;

async function project(): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), { greeting: "Hello" });
  await writeJsonFile(join(dir, "locales", "de.json"), { greeting: "Hallo" });
  await writeFile(join(dir, LOCK_FILE_NAME), LOCK_CONTENT, "utf8");
  return dir;
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

describe("pseudolocalize: an output directory that reaches through a symbolic link", () => {
  it("refuses a linked directory pointing outside the project before anything is read, and writes nothing there", async () => {
    const dir = await project();
    const outside = await makeTempDir();
    await symlink(outside, join(dir, "out-link"), "dir");
    const counting = readCountingFs();

    await expect(
      pseudolocalize({ config: cfg(), cwd: dir, out: "out-link" }, { fs: counting.fs }),
    ).rejects.toMatchObject({
      code: "PSEUDO_OUTPUT_CONFLICT",
      message: expect.stringContaining(
        'The output directory "out-link" resolves outside the working directory through a symbolic link.',
      ),
    });
    expect(counting.reads()).toBe(0);
    expect(await readdir(outside)).toEqual([]);
  });

  it("refuses a directory under the output whose link points outside the project", async () => {
    const dir = await project();
    const outside = await makeTempDir();
    await mkdir(join(dir, "pseudo"));
    await symlink(outside, join(dir, "pseudo", "locales"), "dir");

    await expect(pseudolocalize({ config: cfg(), cwd: dir, out: "pseudo" })).rejects.toMatchObject({
      code: "PSEUDO_OUTPUT_CONFLICT",
      message: expect.stringContaining(
        "resolves outside the working directory through a symbolic link.",
      ),
    });
    expect(await readdir(outside)).toEqual([]);
  });

  it("refuses a linked directory that resolves to the project root", async () => {
    const dir = await project();
    await symlink(dir, join(dir, "here"), "dir");

    await expect(pseudolocalize({ config: cfg(), cwd: dir, out: "here" })).rejects.toMatchObject({
      code: "PSEUDO_OUTPUT_CONFLICT",
      message: expect.stringContaining('"here" names the working directory itself.'),
    });
    expect(await readdir(join(dir, "locales"))).toEqual(["de.json", "en.json"]);
  });

  it("refuses a pseudolocale file that is a link onto the lock file and leaves the lock untouched", async () => {
    const dir = await project();
    await mkdir(join(dir, "pseudo", "locales"), { recursive: true });
    await symlink(join(dir, LOCK_FILE_NAME), join(dir, "pseudo", "locales", "en-XA.json"), "file");

    await expect(pseudolocalize({ config: cfg(), cwd: dir, out: "pseudo" })).rejects.toMatchObject({
      code: "PSEUDO_OUTPUT_CONFLICT",
      message: expect.stringContaining("resolves to the lock file"),
    });
    expect(await readFile(join(dir, LOCK_FILE_NAME), "utf8")).toBe(LOCK_CONTENT);
  });

  it("writes through a linked directory that stays inside the project", async () => {
    const dir = await project();
    await mkdir(join(dir, "generated"));
    await symlink(join(dir, "generated"), join(dir, "latest"), "dir");

    const result = await pseudolocalize({ config: cfg(), cwd: dir, out: "latest" });

    expect(result.path).toBe(join(dir, "latest", "locales", "en-XA.json"));
    expect(await readJsonFile(join(dir, "generated", "locales", "en-XA.json"))).toEqual({
      greeting: "[Ĥéĺĺó··]",
    });
  });

  it("checks only the path as written when the file-system port cannot resolve links", async () => {
    const dir = await project();
    const { realpath: _realpath, ...withoutRealpath } = defaultFs;

    const result = await pseudolocalize(
      { config: cfg(), cwd: dir, out: "plain" },
      { fs: withoutRealpath },
    );

    expect(result.path).toBe(join(dir, "plain", "locales", "en-XA.json"));
  });
});
