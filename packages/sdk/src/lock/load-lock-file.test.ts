import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultFs } from "../fs.js";
import { makeTempDir, writeJsonFile } from "../test-support.js";
import { loadLockFile } from "./load-lock-file.js";
import { updateLockFileLocale } from "./lock-file.js";

const NO_PROVENANCE = { records: new Map() };

describe("loadLockFile", () => {
  it("degrades a missing lock-file to an empty lock, mirroring readLockFile", async () => {
    const dir = await makeTempDir();
    const lock = await loadLockFile({ cwd: dir });
    expect(lock).toEqual({ version: 1, locales: {} });
  });

  it("reads an existing lock-file's recorded entries", async () => {
    const dir = await makeTempDir();
    await updateLockFileLocale(
      dir,
      defaultFs,
      "de",
      {
        mode: "replace",
        entries: { greeting: "abc" },
      },
      NO_PROVENANCE,
    );

    const result = await loadLockFile({ cwd: dir });
    expect(result.locales.de).toEqual({ greeting: "abc" });
  });

  it("throws LOCK_FILE_INVALID when the lock-file is corrupt", async () => {
    const dir = await makeTempDir();
    await writeJsonFile(join(dir, "verbatra.lock.json"), "not a lock object");
    await expect(loadLockFile({ cwd: dir })).rejects.toMatchObject({ code: "LOCK_FILE_INVALID" });
  });

  it("defaults cwd to process.cwd() when omitted", async () => {
    const lock = await loadLockFile();
    expect(lock.version).toBeGreaterThanOrEqual(1);
  });
});
