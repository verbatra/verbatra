import { readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type BoundedFileRead, defaultFs } from "../fs.js";
import { makeFakeFs, makeTempDir, readTextFile } from "../test-support.js";
import {
  applyProvenancePatch,
  emptyProvenance,
  PROVENANCE_FILE_NAME,
  type ProvenanceFile,
  type ProvenanceRecord,
  provenanceFilePath,
  readProvenanceFile,
  serializeProvenanceFile,
  settleProvenance,
  valueHash,
  withLocaleRecords,
  writeProvenanceLocale,
} from "./provenance-file.js";

const machine = (value: string): ProvenanceRecord => ({
  origin: "machine",
  provider: "anthropic",
  model: "m",
  valueHash: valueHash(value),
});

function fileWith(locales: Record<string, Record<string, ProvenanceRecord>>): ProvenanceFile {
  let file = emptyProvenance();
  for (const [locale, entries] of Object.entries(locales)) {
    file = withLocaleRecords(file, locale, entries);
  }
  return file;
}

async function writeRaw(dir: string, content: string): Promise<string> {
  const path = provenanceFilePath(dir);
  await writeFile(path, content, "utf8");
  return path;
}

describe("readProvenanceFile", () => {
  it("reads a missing file as an empty, writable record", async () => {
    const dir = await makeTempDir();
    const read = await readProvenanceFile(provenanceFilePath(dir), defaultFs);
    expect(read.writable).toBe(true);
    expect(read.file.version).toBe(1);
    expect(Object.keys(read.file.locales)).toEqual([]);
  });

  it("reads a file from a newer version as empty and not writable", async () => {
    const dir = await makeTempDir();
    const path = await writeRaw(dir, JSON.stringify({ version: 2, locales: { de: { a: 1 } } }));
    const read = await readProvenanceFile(path, defaultFs);
    expect(read.writable).toBe(false);
    expect(Object.keys(read.file.locales)).toEqual([]);
  });

  it.each([
    ["not JSON", "{ nope", "is not valid JSON"],
    ["an array", "[]", "has an unexpected shape"],
    ["a string version", '{"version":"1","locales":{}}', "has an unexpected shape"],
    ["a fractional version", '{"version":1.5,"locales":{}}', "has an unexpected shape"],
    ["a zero version", '{"version":0,"locales":{}}', "has an unexpected shape"],
    ["missing locales", '{"version":1}', "has an unexpected shape"],
    [
      "a locale that is not an object",
      '{"version":1,"locales":{"de":[]}}',
      "has an unexpected shape",
    ],
    [
      "a record without a value hash",
      '{"version":1,"locales":{"de":{"a":{"origin":"human"}}}}',
      "has an unexpected shape",
    ],
    [
      "a record whose origin is not a string",
      '{"version":1,"locales":{"de":{"a":{"origin":1,"valueHash":"h"}}}}',
      "has an unexpected shape",
    ],
    [
      "a record with a non-string optional field",
      '{"version":1,"locales":{"de":{"a":{"origin":"human","valueHash":"h","reviewer":7}}}}',
      "has an unexpected shape",
    ],
    [
      "a record that is null",
      '{"version":1,"locales":{"de":{"a":null}}}',
      "has an unexpected shape",
    ],
  ])("rejects %s as PROVENANCE_FILE_INVALID", async (_label, content, detail) => {
    const dir = await makeTempDir();
    const path = await writeRaw(dir, content);
    await expect(readProvenanceFile(path, defaultFs)).rejects.toMatchObject({
      code: "PROVENANCE_FILE_INVALID",
      message: `The provenance file at ${path} ${detail}.`,
    });
  });

  it("rejects an oversized file as PROVENANCE_FILE_INVALID", async () => {
    const fs = makeFakeFs({
      readFileBounded: async (): Promise<BoundedFileRead> => ({ kind: "too-large" }),
    });
    await expect(readProvenanceFile("/p/verbatra.provenance.json", fs)).rejects.toMatchObject({
      code: "PROVENANCE_FILE_INVALID",
    });
  });

  it("keeps a key named __proto__ as an own record without touching Object.prototype", async () => {
    const dir = await makeTempDir();
    const path = await writeRaw(
      dir,
      '{"version":1,"locales":{"de":{"__proto__":{"origin":"human","valueHash":"h"}}}}',
    );
    const read = await readProvenanceFile(path, defaultFs);
    const de = read.file.locales.de ?? {};
    expect(Object.hasOwn(de, "__proto__")).toBe(true);
    expect(Object.getOwnPropertyDescriptor(de, "__proto__")?.value).toEqual({
      origin: "human",
      valueHash: "h",
    });
    expect(({} as Record<string, unknown>).origin).toBeUndefined();
  });
});

describe("serializeProvenanceFile", () => {
  it("writes locales and keys sorted, one record per line, fields in a fixed order", () => {
    const file = fileWith({
      fr: { b: { origin: "human", valueHash: "2" } },
      de: {
        z: { reviewer: "mk", reviewState: "approved", valueHash: "1", origin: "human" },
        a: machine("x"),
      },
    });

    expect(serializeProvenanceFile(file)).toBe(
      [
        "{",
        '  "version": 1,',
        '  "locales": {',
        '    "de": {',
        `      "a": {"origin":"machine","provider":"anthropic","model":"m","valueHash":"${valueHash("x")}"},`,
        '      "z": {"origin":"human","valueHash":"1","reviewState":"approved","reviewer":"mk"}',
        "    },",
        '    "fr": {',
        '      "b": {"origin":"human","valueHash":"2"}',
        "    }",
        "  }",
        "}",
        "",
      ].join("\n"),
    );
  });

  it("keeps fields it does not know after the known ones, sorted", () => {
    const record = { origin: "derived", valueHash: "h", zeta: 1, alpha: "a" } as ProvenanceRecord;
    expect(serializeProvenanceFile(fileWith({ de: { k: record } }))).toContain(
      '"k": {"origin":"derived","valueHash":"h","alpha":"a","zeta":1}',
    );
  });

  it("drops locales with no records and writes an empty file compactly", () => {
    expect(serializeProvenanceFile(fileWith({ de: {} }))).toBe(
      '{\n  "version": 1,\n  "locales": {}\n}\n',
    );
  });

  it("round-trips through the reader", async () => {
    const dir = await makeTempDir();
    const file = fileWith({ de: { a: machine("x"), b: { origin: "import", valueHash: "y" } } });
    const path = await writeRaw(dir, serializeProvenanceFile(file));
    const read = await readProvenanceFile(path, defaultFs);
    expect(serializeProvenanceFile(read.file)).toBe(serializeProvenanceFile(file));
  });
});

describe("applyProvenancePatch", () => {
  const unchanged = () => true;
  const changed = () => false;

  it("keeps the prior record, review decision included, when neither the value nor the source changed", () => {
    const approved = { ...machine("Hallo"), reviewState: "approved", reviewer: "mk" };
    const next = applyProvenancePatch(
      { k: approved },
      { records: new Map([["k", { origin: "import", valueHash: valueHash("Hallo") }]]) },
      unchanged,
    );
    expect(next.k).toEqual(approved);
  });

  it("replaces the record when the value changed", () => {
    const approved = { ...machine("Hallo"), reviewState: "approved" };
    const next = applyProvenancePatch(
      { k: approved },
      { records: new Map([["k", { origin: "human", valueHash: valueHash("Servus") }]]) },
      unchanged,
    );
    expect(next.k).toEqual({ origin: "human", valueHash: valueHash("Servus") });
  });

  it("replaces the record when the source hash changed, even for the same value", () => {
    const approved = { ...machine("Hallo"), reviewState: "approved" };
    const fresh = machine("Hallo");
    const next = applyProvenancePatch(
      { k: approved },
      { records: new Map([["k", fresh]]) },
      changed,
    );
    expect(next.k).toEqual(fresh);
  });

  it("drops records outside retain but keeps a rejected record as a tombstone", () => {
    const next = applyProvenancePatch(
      {
        kept: machine("a"),
        gone: machine("b"),
        rejected: { ...machine("c"), reviewState: "rejected" },
      },
      { records: new Map(), retain: new Set(["kept"]) },
      unchanged,
    );
    expect(Object.keys(next).sort()).toEqual(["kept", "rejected"]);
  });

  it("carries every record through untouched without retain", () => {
    const next = applyProvenancePatch(
      { a: machine("a"), b: { origin: "future", valueHash: "h", extra: true } as ProvenanceRecord },
      { records: new Map() },
      unchanged,
    );
    expect(next).toEqual({
      a: machine("a"),
      b: { origin: "future", valueHash: "h", extra: true },
    });
  });

  it("adds a record for a key with no prior locale entry", () => {
    const next = applyProvenancePatch(
      undefined,
      { records: new Map([["k", machine("x")]]) },
      changed,
    );
    expect(next.k).toEqual(machine("x"));
  });
});

describe("settleProvenance", () => {
  it("hashes the value as it was read back, falling back to the value written", () => {
    const patch = settleProvenance(
      new Map([
        ["read", { origin: "human", value: "A & B" }],
        ["absent", { origin: "machine", value: "x", attribution: { provider: "deepl" } }],
      ]),
      {
        locale: "de",
        namespace: "",
        format: "xliff",
        entries: new Map([
          [
            "read",
            { key: "read", namespace: "", value: "A &amp; B", placeholders: [], isPlural: false },
          ],
        ]),
      },
    );
    expect(patch.retain).toBeUndefined();
    expect(patch.records.get("read")).toEqual({
      origin: "human",
      valueHash: valueHash("A &amp; B"),
    });
    expect(patch.records.get("absent")).toEqual({
      origin: "machine",
      provider: "deepl",
      valueHash: valueHash("x"),
    });
  });
});

describe("valueHash", () => {
  it("ignores line-ending and Unicode normalization differences", () => {
    expect(valueHash("a\r\nb")).toBe(valueHash("a\nb"));
    expect(valueHash("Café")).toBe(valueHash("Café"));
    expect(valueHash("a")).not.toBe(valueHash("b"));
  });
});

describe("writeProvenanceLocale", () => {
  it("creates no file when there is nothing to record", async () => {
    const dir = await makeTempDir();
    await writeProvenanceLocale(dir, defaultFs, "de", { records: new Map() }, () => true);
    expect(await readdir(dir)).not.toContain(PROVENANCE_FILE_NAME);
  });

  it("writes a locale's records and skips the write when nothing changed", async () => {
    const dir = await makeTempDir();
    const patch = { records: new Map([["k", machine("x")]]) };
    await writeProvenanceLocale(dir, defaultFs, "de", patch, () => true);
    const first = await readTextFile(provenanceFilePath(dir));

    let writes = 0;
    const counting = {
      ...defaultFs,
      writeFile: async (path: string, data: string): Promise<void> => {
        writes += 1;
        await defaultFs.writeFile(path, data);
      },
    };
    await writeProvenanceLocale(dir, counting, "de", patch, () => true);

    expect(writes).toBe(0);
    expect(await readTextFile(provenanceFilePath(dir))).toBe(first);
  });

  it("leaves a file from a newer verbatra untouched", async () => {
    const dir = await makeTempDir();
    const newer = '{"version":7,"locales":{}}';
    const path = await writeRaw(dir, newer);
    await writeProvenanceLocale(
      dir,
      defaultFs,
      "de",
      { records: new Map([["k", machine("x")]]) },
      () => true,
    );
    expect(await readTextFile(path)).toBe(newer);
  });

  it("keeps other locales as they were", async () => {
    const dir = await makeTempDir();
    await writeProvenanceLocale(
      dir,
      defaultFs,
      "fr",
      { records: new Map([["k", machine("f")]]) },
      () => true,
    );
    await writeProvenanceLocale(
      dir,
      defaultFs,
      "de",
      { records: new Map([["k", machine("d")]]) },
      () => true,
    );
    const read = await readProvenanceFile(join(dir, PROVENANCE_FILE_NAME), defaultFs);
    expect(read.file.locales.fr?.k).toEqual(machine("f"));
    expect(read.file.locales.de?.k).toEqual(machine("d"));
  });
});
