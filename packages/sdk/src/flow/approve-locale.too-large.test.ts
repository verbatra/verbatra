import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { PROVENANCE_FILE_NAME } from "../lock/provenance-file.js";
import {
  baseConfig,
  makeStubProvider,
  makeTempDir,
  readTextFile,
  writeJsonFile,
} from "../test-support.js";
import { approveLocale } from "./approve-locale.js";
import { translate } from "./translate-project.js";

vi.mock(import("../lock/provenance-file.js"), async (importOriginal) => ({
  ...(await importOriginal()),
  planProvenanceRecords: async () => ({ kind: "too-large" as const }),
}));

describe("approveLocale: approvals that would outgrow the provenance file", () => {
  it("refuses with PROVENANCE_FILE_UNWRITABLE and writes nothing", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, "locales"));
    await writeJsonFile(join(dir, "locales", "en.json"), { greeting: "Hello" });
    const config = baseConfig({ targetLocales: ["de"] });
    await translate({ config, cwd: dir }, { createProvider: () => makeStubProvider().provider });
    const before = await readTextFile(join(dir, PROVENANCE_FILE_NAME));

    await expect(approveLocale({ config, cwd: dir, locale: "de" })).rejects.toMatchObject({
      code: "PROVENANCE_FILE_UNWRITABLE",
      message: expect.stringContaining("past the size verbatra reads back"),
    });
    expect(await readTextFile(join(dir, PROVENANCE_FILE_NAME))).toBe(before);
  });
});
