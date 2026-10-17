import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeTempDir } from "../test-support.js";
import { loadProvenance } from "./load-provenance.js";
import { PROVENANCE_FILE_NAME } from "./provenance-file.js";

describe("loadProvenance", () => {
  it("returns the stored records", async () => {
    const dir = await makeTempDir();
    await writeFile(
      join(dir, PROVENANCE_FILE_NAME),
      '{"version":1,"locales":{"de":{"k":{"origin":"human","valueHash":"h"}}}}',
      "utf8",
    );
    const file = await loadProvenance({ cwd: dir });
    expect(file.version).toBe(1);
    expect(file.locales.de?.k).toEqual({ origin: "human", valueHash: "h" });
  });

  it("reads a missing file as empty, defaulting to the process working directory", async () => {
    const dir = await makeTempDir();
    const previous = process.cwd();
    process.chdir(dir);
    try {
      expect(Object.keys((await loadProvenance()).locales)).toEqual([]);
    } finally {
      process.chdir(previous);
    }
  });

  it("throws PROVENANCE_FILE_INVALID for a corrupt file", async () => {
    const dir = await makeTempDir();
    await writeFile(join(dir, PROVENANCE_FILE_NAME), "nope", "utf8");
    await expect(loadProvenance({ cwd: dir })).rejects.toMatchObject({
      code: "PROVENANCE_FILE_INVALID",
    });
  });
});
