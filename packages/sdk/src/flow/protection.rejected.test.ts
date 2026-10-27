import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultFs, type SdkFs } from "../fs.js";
import { PROVENANCE_FILE_NAME, valueHash } from "../lock/provenance-file.js";
import { baseConfig, makeTempDir, writeJsonFile } from "../test-support.js";
import {
  isRejectedValue,
  protectionPolicy,
  readProvenanceView,
  readRejectedValueHashes,
} from "./protection.js";

const overwrite = protectionPolicy(baseConfig(), "overwrite");
const protect = protectionPolicy(baseConfig());

async function withProvenance(file: unknown): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(dir, { recursive: true });
  await writeJsonFile(join(dir, PROVENANCE_FILE_NAME), file);
  return dir;
}

const rejectedFile = {
  version: 1,
  locales: {
    de: {
      greeting: { origin: "machine", valueHash: valueHash("Hallo"), reviewState: "rejected" },
      farewell: { origin: "machine", valueHash: valueHash("Tschuss") },
    },
  },
};

describe("readRejectedValueHashes: which values a reviewer rejected", () => {
  it("lists only rejected records from the view the run already read", async () => {
    const dir = await withProvenance(rejectedFile);
    const view = await readProvenanceView(protect, dir, defaultFs, "de");

    const rejected = await readRejectedValueHashes(protect, view, dir, defaultFs, "de");

    expect([...rejected]).toEqual([["greeting", valueHash("Hallo")]]);
  });

  it("reads the file itself under humanEdits overwrite", async () => {
    const dir = await withProvenance(rejectedFile);
    const view = await readProvenanceView(overwrite, dir, defaultFs, "de");

    const rejected = await readRejectedValueHashes(overwrite, view, dir, defaultFs, "de");

    expect([...rejected]).toEqual([["greeting", valueHash("Hallo")]]);
  });

  it("knows nothing when the provenance file is from a newer verbatra", async () => {
    const dir = await withProvenance({ ...rejectedFile, version: 99 });

    expect((await readRejectedValueHashes(overwrite, new Map(), dir, defaultFs, "de")).size).toBe(
      0,
    );
    expect((await readRejectedValueHashes(protect, "unreadable", dir, defaultFs, "de")).size).toBe(
      0,
    );
  });

  it("rethrows a file-system failure that is not a corrupt provenance file", async () => {
    const dir = await makeTempDir();
    const failing: SdkFs = {
      ...defaultFs,
      readFileBounded: () => Promise.reject(new Error("disk gone")),
    };

    await expect(readRejectedValueHashes(overwrite, new Map(), dir, failing, "de")).rejects.toThrow(
      "disk gone",
    );
  });
});

describe("isRejectedValue", () => {
  const rejected = new Map([["greeting", valueHash("Hallo")]]);

  it.each([
    ["the rejected value", "greeting", "Hallo", true],
    [
      "the rejected value in another normalization form",
      "greeting",
      "Hallo".normalize("NFD"),
      true,
    ],
    ["a different value", "greeting", "Servus", false],
    ["a key with no rejection", "farewell", "Hallo", false],
  ])("matches %s", (_label, key, value, expected) => {
    expect(isRejectedValue(rejected, key, value)).toBe(expected);
  });

  it("matches nothing without rejection data", () => {
    expect(isRejectedValue(undefined, "greeting", "Hallo")).toBe(false);
  });
});
