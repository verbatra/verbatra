import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultFs, type SdkFs } from "../fs.js";
import { withLockFileGuard } from "../lock/locale-write-lock.js";
import { deferred, makeRunHistoryRecord, makeTempDir } from "../test-support.js";
import { MAX_RUN_HISTORY_RECORD_BYTES, serializeRunHistoryRecord } from "./record.js";
import {
  appendRunHistoryRecord,
  MAX_RUN_HISTORY_FILE_BYTES,
  MAX_RUN_HISTORY_RECORDS,
  readRunHistoryFile,
  runHistoryFilePath,
} from "./run-history-file.js";

async function project(content?: string | Uint8Array): Promise<string> {
  const dir = await makeTempDir();
  if (content !== undefined) {
    const path = runHistoryFilePath(dir);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  }
  return dir;
}

function line(overrides: Parameters<typeof makeRunHistoryRecord>[0] = {}): string {
  return serializeRunHistoryRecord(makeRunHistoryRecord(overrides));
}

async function readBack(dir: string) {
  return readRunHistoryFile(runHistoryFilePath(dir), defaultFs);
}

describe("readRunHistoryFile", () => {
  it("treats a missing file as an empty history, not as unavailable", async () => {
    const read = await readBack(await project());

    expect(read).toEqual({ records: [], unreadableRecords: 0 });
  });

  it("reads records oldest first and normalizes omitted zero counts", async () => {
    const dir = await project(
      `${line({ at: "2026-11-09T10:00:00.000Z" })}\n${line({ at: "2026-11-09T11:00:00.000Z" })}\n`,
    );

    const read = await readBack(dir);

    expect(read.records.map((record) => record.at)).toEqual([
      "2026-11-09T10:00:00.000Z",
      "2026-11-09T11:00:00.000Z",
    ]);
    expect(read.records[0]?.locales[0]).toMatchObject({ cacheHits: 0, providerFailures: 0 });
    expect(read.unreadableRecords).toBe(0);
  });

  it("drops one bad line alone and counts it", async () => {
    const dir = await project(`${line()}\n{ not json\n${line()}\n`);

    const read = await readBack(dir);

    expect(read.records).toHaveLength(2);
    expect(read.unreadableRecords).toBe(1);
  });

  it("counts a record at a newer version without dropping its neighbours", async () => {
    const newer = JSON.stringify({ ...makeRunHistoryRecord(), version: 2 });
    const dir = await project(`${line()}\n${newer}\n${line()}\n`);

    const read = await readBack(dir);

    expect(read.records).toHaveLength(2);
    expect(read.unreadableRecords).toBe(1);
  });

  it("counts a line over 16 KiB without parsing it", async () => {
    const huge = `${line()}${" ".repeat(MAX_RUN_HISTORY_RECORD_BYTES)}`;
    const dir = await project(`${line()}\n${huge}\n${line()}\n`);

    const read = await readBack(dir);

    expect(read.records).toHaveLength(2);
    expect(read.unreadableRecords).toBe(1);
  });

  it("counts a 1 MiB line as one unreadable record", async () => {
    const dir = await project(`${line()}\n${"x".repeat(1024 * 1024)}\n`);

    const read = await readBack(dir);

    expect(read.records).toHaveLength(1);
    expect(read.unreadableRecords).toBe(1);
  });

  it("reports a file over 8 MiB as unavailable and empty", async () => {
    const dir = await project(Buffer.alloc(20 * 1024 * 1024, 0x61));

    const read = await readBack(dir);

    expect(read).toEqual({ records: [], unreadableRecords: 0, unavailable: "too-large" });
  });

  it("reads a file of exactly the cap and refuses one byte more", async () => {
    const exact = await project(Buffer.alloc(MAX_RUN_HISTORY_FILE_BYTES, 0x0a));
    const over = await project(Buffer.alloc(MAX_RUN_HISTORY_FILE_BYTES + 1, 0x0a));

    expect((await readBack(exact)).unavailable).toBeUndefined();
    expect((await readBack(over)).unavailable).toBe("too-large");
  });

  it("counts a NUL-filled file as unreadable records, never as a crash", async () => {
    const dir = await project(Buffer.alloc(4096, 0));

    const read = await readBack(dir);

    expect(read.records).toEqual([]);
    expect(read.unreadableRecords).toBe(1);
  });

  it("reports a file that is not UTF-8 as unavailable", async () => {
    const dir = await project(Buffer.from([0xff, 0xfe, 0x7b, 0x7d, 0x0a]));

    const read = await readBack(dir);

    expect(read).toEqual({ records: [], unreadableRecords: 0, unavailable: "not-utf8" });
  });

  it("reports a directory at the path as unavailable", async () => {
    const dir = await makeTempDir();
    await mkdir(runHistoryFilePath(dir), { recursive: true });

    const read = await readBack(dir);

    expect(read.unavailable).toBe("unreadable");
  });

  it("reports a rejecting read as unavailable", async () => {
    const fs: SdkFs = {
      ...defaultFs,
      readBytesBounded: () => Promise.reject(new Error("EIO")),
    };

    const read = await readRunHistoryFile("/anywhere", fs);

    expect(read.unavailable).toBe("unreadable");
  });

  it("ignores a __proto__ key on a record and pollutes nothing", async () => {
    const poisoned = line().replace(
      /^\{/,
      '{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},',
    );
    const dir = await project(`${poisoned}\n`);

    const read = await readBack(dir);

    expect(read.records).toHaveLength(1);
    expect(read.records[0]).not.toHaveProperty("polluted");
    expect(Object.hasOwn(read.records[0] ?? {}, "__proto__")).toBe(false);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it.each([
    [
      "a non-finite token count",
      (text: string) => text.replace('"translated":2', '"translated":1e999'),
    ],
    [
      "a negative translated count",
      (text: string) => text.replace('"translated":2', '"translated":-1'),
    ],
    ["a fractional count", (text: string) => text.replace('"translated":2', '"translated":1.5')],
    [
      "a count past the safe integers",
      (text: string) => text.replace('"translated":2', '"translated":9007199254740993'),
    ],
    [
      "a currency that is not three capitals",
      (text: string) =>
        text
          .replace("no-rate-on-file", "priced")
          .replace('"basis"', '"currency":"usd","asOf":"2026-11-09","amount":1,"basis"'),
    ],
    [
      "a timestamp that is not ISO",
      (text: string) => text.replace("2026-11-09T10:00:00.000Z", "yesterday"),
    ],
    ["an unknown status", (text: string) => text.replace('"succeeded"', '"done"')],
  ])("counts %s as one unreadable record", async (_label, corrupt) => {
    const dir = await project(`${corrupt(line())}\n${line()}\n`);

    const read = await readBack(dir);

    expect(read.records).toHaveLength(1);
    expect(read.unreadableRecords).toBe(1);
  });

  it("counts negative token usage as unreadable", async () => {
    const bad = line({ usage: { inputTokens: -1, outputTokens: 0 } });
    const dir = await project(`${bad}\n`);

    expect((await readBack(dir)).unreadableRecords).toBe(1);
  });

  it("keeps a rate of 1e9 priced and finite", async () => {
    const priced = line({
      cost: {
        pricing: "priced",
        basis: "usage",
        rateKey: "anthropic/test-model",
        currency: "USD",
        asOf: "2026-11-09",
        amount: 1e9,
      },
    });

    const read = await readBack(await project(`${priced}\n`));

    expect(read.records[0]?.cost).toMatchObject({ pricing: "priced", amount: 1e9 });
  });
});

describe("appendRunHistoryRecord", () => {
  it("creates the file with one record", async () => {
    const dir = await project();

    await appendRunHistoryRecord(dir, defaultFs, makeRunHistoryRecord());

    expect((await readBack(dir)).records).toHaveLength(1);
  });

  it("keeps the newest 1,000 of 1,500 existing records, newest last", async () => {
    const existing = Array.from({ length: 1500 }, (_, index) => line({ entries: index })).join(
      "\n",
    );
    const dir = await project(`${existing}\n`);

    await appendRunHistoryRecord(dir, defaultFs, makeRunHistoryRecord({ entries: 1500 }));

    const read = await readBack(dir);
    expect(read.records).toHaveLength(MAX_RUN_HISTORY_RECORDS);
    expect(read.records[0]?.entries).toBe(501);
    expect(read.records.at(-1)?.entries).toBe(1500);
  });

  it("rewrites a corrupt file without its bad lines", async () => {
    const dir = await project(`${line()}\n{ nope\n\u0000\u0000\n`);

    await appendRunHistoryRecord(dir, defaultFs, makeRunHistoryRecord());

    const text = await readFile(runHistoryFilePath(dir), "utf8");
    expect(text.trim().split("\n")).toHaveLength(2);
    expect((await readBack(dir)).unreadableRecords).toBe(0);
  });

  it("replaces an oversized file with the new record alone", async () => {
    const dir = await project(Buffer.alloc(MAX_RUN_HISTORY_FILE_BYTES + 5, 0x61));

    await appendRunHistoryRecord(dir, defaultFs, makeRunHistoryRecord());

    expect((await readBack(dir)).records).toHaveLength(1);
  });

  it("keeps every record when two runs finish together", async () => {
    const dir = await project();

    await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        appendRunHistoryRecord(dir, defaultFs, makeRunHistoryRecord({ entries: index })),
      ),
    );

    const read = await readBack(dir);
    expect(
      read.records.map((record) => record.entries).sort((a, b) => (a ?? 0) - (b ?? 0)),
    ).toEqual(Array.from({ length: 12 }, (_, index) => index));
  });

  it("gives up within the acquire timeout while the lock-file guard is held", async () => {
    const dir = await project();
    const release = deferred();
    const holding = withLockFileGuard(dir, defaultFs, () => release.promise);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const started = Date.now();

    await expect(
      appendRunHistoryRecord(dir, defaultFs, makeRunHistoryRecord(), 150),
    ).rejects.toMatchObject({ code: "LOCK_CONTENDED" });

    expect(Date.now() - started).toBeLessThan(2000);
    release.resolve();
    await holding;
    expect((await readBack(dir)).records).toHaveLength(0);
  });

  it("trims locales to fit a record into 16 KiB and says how many it left out", async () => {
    const dir = await project();
    const locale = makeRunHistoryRecord().locales[0];
    if (locale === undefined) {
      throw new Error("fixture has no locale");
    }
    const many = Array.from({ length: 400 }, (_, index) => ({ ...locale, locale: `l${index}` }));

    await appendRunHistoryRecord(dir, defaultFs, makeRunHistoryRecord({ locales: many }));

    const text = await readFile(runHistoryFilePath(dir), "utf8");
    expect(Buffer.byteLength(text.trim())).toBeLessThanOrEqual(MAX_RUN_HISTORY_RECORD_BYTES);
    const record = (await readBack(dir)).records[0];
    expect(record?.locales.length).toBeLessThan(400);
    expect((record?.locales.length ?? 0) + (record?.localesOmitted ?? 0)).toBe(400);
  });
});
