import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  baseConfig,
  makeStubProvider,
  makeTempDir,
  readJsonFile,
  writeJsonFile,
} from "../test-support.js";
import { approveEntry, rejectEntry } from "./review-decision.js";
import { translate } from "./translate-project.js";

vi.mock(import("../lock/provenance-file.js"), async (importOriginal) => ({
  ...(await importOriginal()),
  planProvenanceRecord: async () => ({ kind: "too-large" as const }),
}));

describe("approveEntry and rejectEntry: a decision that would outgrow the provenance file", () => {
  it.each([
    ["approveEntry", approveEntry],
    ["rejectEntry", rejectEntry],
  ])(
    "%s refuses with PROVENANCE_FILE_UNWRITABLE and leaves the value in place",
    async (_name, decide) => {
      const dir = await makeTempDir();
      await mkdir(join(dir, "locales"));
      await writeJsonFile(join(dir, "locales", "en.json"), { greeting: "Hello" });
      const config = baseConfig({ targetLocales: ["de"] });
      await translate({ config, cwd: dir }, { createProvider: () => makeStubProvider().provider });
      const before = await readJsonFile(join(dir, "locales", "de.json"));
      const value = (before as Record<string, string>).greeting ?? "";

      await expect(
        decide({ config, cwd: dir, locale: "de", key: "greeting", expectedValue: value }),
      ).rejects.toMatchObject({
        code: "PROVENANCE_FILE_UNWRITABLE",
        message: expect.stringContaining("past the size verbatra reads back"),
      });
      expect(await readJsonFile(join(dir, "locales", "de.json"))).toEqual(before);
    },
  );
});
