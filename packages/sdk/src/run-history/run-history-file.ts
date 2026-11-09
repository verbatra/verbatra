import { dirname, resolve } from "node:path";
import type { SdkFs } from "../fs.js";
import { LOCAL_DIR_NAME } from "../local-dir.js";
import { withLockFileGuard } from "../lock/locale-write-lock.js";
import {
  fitRecord,
  MAX_RUN_HISTORY_RECORD_BYTES,
  type RunHistoryRecordParsed,
  type RunHistoryUnavailableReason,
  runHistoryRecordSchema,
} from "./record.js";

export const RUN_HISTORY_FILE_NAME = "run-history.jsonl";

export const MAX_RUN_HISTORY_RECORDS = 1000;

export const MAX_RUN_HISTORY_FILE_BYTES = 8 * 1024 * 1024;

export const RUN_HISTORY_ACQUIRE_TIMEOUT_MS = 3000;

export interface RunHistoryRead {
  readonly records: readonly RunHistoryRecordParsed[];
  readonly unreadableRecords: number;
  readonly unavailable?: RunHistoryUnavailableReason;
}

export function runHistoryFilePath(cwd: string): string {
  return resolve(cwd, LOCAL_DIR_NAME, RUN_HISTORY_FILE_NAME);
}

function emptyRead(unavailable?: RunHistoryUnavailableReason): RunHistoryRead {
  return {
    records: [],
    unreadableRecords: 0,
    ...(unavailable === undefined ? {} : { unavailable }),
  };
}

function decode(bytes: Uint8Array): string | undefined {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
}

function parseLine(line: string): RunHistoryRecordParsed | undefined {
  if (Buffer.byteLength(line) > MAX_RUN_HISTORY_RECORD_BYTES) {
    return undefined;
  }
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return undefined;
  }
  const parsed = runHistoryRecordSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function parseLines(text: string): RunHistoryRead {
  const records: RunHistoryRecordParsed[] = [];
  let unreadableRecords = 0;
  for (const line of text.split("\n")) {
    if (line.trim() === "") {
      continue;
    }
    const record = parseLine(line);
    if (record === undefined) {
      unreadableRecords += 1;
    } else {
      records.push(record);
    }
  }
  return { records, unreadableRecords };
}

export async function readRunHistoryFile(path: string, fs: SdkFs): Promise<RunHistoryRead> {
  let read: Awaited<ReturnType<SdkFs["readBytesBounded"]>>;
  try {
    read = await fs.readBytesBounded(path, MAX_RUN_HISTORY_FILE_BYTES);
  } catch {
    return emptyRead("unreadable");
  }
  if (read.kind === "too-large") {
    return emptyRead("too-large");
  }
  if (read.kind === "missing") {
    return emptyRead(read.unreadable === true ? "unreadable" : undefined);
  }
  const text = decode(read.bytes);
  return text === undefined ? emptyRead("not-utf8") : parseLines(text);
}

function withinFileBound(lines: readonly string[]): readonly string[] {
  let total = lines.reduce((sum, line) => sum + Buffer.byteLength(line) + 1, 0);
  let dropped = 0;
  while (total > MAX_RUN_HISTORY_FILE_BYTES && dropped < lines.length - 1) {
    total -= Buffer.byteLength(lines[dropped] ?? "") + 1;
    dropped += 1;
  }
  return lines.slice(dropped);
}

export async function appendRunHistoryRecord(
  cwd: string,
  fs: SdkFs,
  candidate: RunHistoryRecordParsed,
  acquireTimeoutMs: number = RUN_HISTORY_ACQUIRE_TIMEOUT_MS,
): Promise<void> {
  const parsed = runHistoryRecordSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new Error("The run history record does not match its own schema.");
  }
  const record = parsed.data;
  const path = runHistoryFilePath(cwd);
  await withLockFileGuard(
    cwd,
    fs,
    async () => {
      const existing = await readRunHistoryFile(path, fs);
      const kept = existing.records.slice(-(MAX_RUN_HISTORY_RECORDS - 1));
      const lines = withinFileBound([...kept.map(fitRecord), fitRecord(record)]);
      await fs.mkdir?.(dirname(path));
      await fs.writeFile(path, `${lines.join("\n")}\n`);
    },
    { acquireTimeoutMs },
  );
}
