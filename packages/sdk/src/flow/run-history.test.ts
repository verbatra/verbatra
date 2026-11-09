import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultFs, type SdkFs } from "../fs.js";
import { serializeRunHistoryRecord } from "../run-history/record.js";
import { runHistoryFilePath } from "../run-history/run-history-file.js";
import { makeRunHistoryRecord, makeTempDir } from "../test-support.js";
import { RUN_HISTORY_DEFAULT_LIMIT, RUN_HISTORY_MAX_LIMIT, runHistory } from "./run-history.js";

async function projectWith(count: number, trailing = ""): Promise<string> {
  const dir = await makeTempDir();
  const lines = Array.from({ length: count }, (_, index) =>
    serializeRunHistoryRecord(makeRunHistoryRecord({ entries: index })),
  );
  const path = runHistoryFilePath(dir);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${lines.join("\n")}\n${trailing}`);
  return dir;
}

describe("runHistory", () => {
  it("returns an empty history for a project with no file", async () => {
    expect(await runHistory({ cwd: await makeTempDir() })).toEqual({
      records: [],
      total: 0,
      unreadableRecords: 0,
    });
  });

  it("returns the newest records first, limited to 50 by default", async () => {
    const dir = await projectWith(80);

    const result = await runHistory({ cwd: dir });

    expect(result.records).toHaveLength(RUN_HISTORY_DEFAULT_LIMIT);
    expect(result.records[0]?.entries).toBe(79);
    expect(result.total).toBe(80);
  });

  it.each([
    ["above the maximum", 5000, RUN_HISTORY_MAX_LIMIT],
    ["below one", 0, 1],
    ["negative", -4, 1],
    ["fractional", 2.9, 2],
    ["not a number", Number.NaN, RUN_HISTORY_DEFAULT_LIMIT],
    ["infinite", Number.POSITIVE_INFINITY, RUN_HISTORY_DEFAULT_LIMIT],
  ])("clamps a limit that is %s", async (_label, limit, expected) => {
    const dir = await projectWith(300);

    const result = await runHistory({ cwd: dir, limit });

    expect(result.records).toHaveLength(expected);
  });

  it("reports unreadable lines and a file-level failure", async () => {
    const dir = await projectWith(2, "{ broken\n");

    const result = await runHistory({ cwd: dir });

    expect(result).toMatchObject({ total: 2, unreadableRecords: 1 });
    expect(result).not.toHaveProperty("unavailable");
  });

  it("reads through the injected file-system port, from the process directory by default", async () => {
    const seen: string[] = [];
    const fs: SdkFs = {
      ...defaultFs,
      readBytesBounded: (path) => {
        seen.push(path);
        return Promise.resolve({ kind: "missing" });
      },
    };

    const result = await runHistory({}, { fs });

    expect(seen).toEqual([runHistoryFilePath(process.cwd())]);
    expect(result.total).toBe(0);
  });

  it("reports an oversized file as unavailable", async () => {
    const dir = await makeTempDir();
    const path = runHistoryFilePath(dir);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, Buffer.alloc(9 * 1024 * 1024, 0x61));

    expect(await runHistory({ cwd: dir })).toEqual({
      records: [],
      total: 0,
      unreadableRecords: 0,
      unavailable: "too-large",
    });
  });
});
