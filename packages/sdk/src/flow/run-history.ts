import { defaultFs, type SdkFs } from "../fs.js";
import type { RunHistoryRecord, RunHistoryUnavailableReason } from "../run-history/record.js";
import { readRunHistoryFile, runHistoryFilePath } from "../run-history/run-history-file.js";

export { RUN_HISTORY_UNAVAILABLE_REASONS } from "../run-history/record.js";

/** How many records {@link runHistory} returns when `limit` is left out. */
export const RUN_HISTORY_DEFAULT_LIMIT = 50;

/** The most records {@link runHistory} returns, whatever `limit` asks for. */
export const RUN_HISTORY_MAX_LIMIT = 200;

/** Input for {@link runHistory}. */
export interface RunHistoryInput {
  /**
   * Directory holding the `.verbatra-local` directory. Defaults to the process working directory,
   * even when the config was found in a parent directory: pass the root {@link resolveProjectRoot}
   * returns.
   */
  readonly cwd?: string;
  /**
   * How many of the newest records to return. A value below 1 returns one record, a value above
   * 200 returns 200, and a value that is not a number returns the default of 50.
   */
  readonly limit?: number;
}

/** Injectable dependencies for {@link runHistory}. Every field has a working default. */
export interface RunHistoryDeps {
  /** File-system port. Defaults to the real file system. */
  readonly fs?: SdkFs;
}

/** The outcome of {@link runHistory}. */
export interface RunHistoryResult {
  /** The newest records first, at most `limit` of them. */
  readonly records: readonly RunHistoryRecord[];
  /** How many readable records the file holds, which can exceed the number returned. */
  readonly total: number;
  /**
   * How many lines of the file could not be read: not JSON, not the record shape, over 16 KiB, or
   * written by a newer verbatra. They are left out of `records`, and the next recorded run rewrites
   * the file without them.
   */
  readonly unreadableRecords: number;
  /**
   * Set when the whole file could not be read, so `records` is empty for that reason and not
   * because no run was recorded. Absent when the file was read, or does not exist yet.
   */
  readonly unavailable?: RunHistoryUnavailableReason | undefined;
}

function clampedLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) {
    return RUN_HISTORY_DEFAULT_LIMIT;
  }
  return Math.min(RUN_HISTORY_MAX_LIMIT, Math.max(1, Math.floor(limit)));
}

/**
 * Reads the local run history that finished {@link translate}, {@link watch},
 * {@link retranslateEntry} and {@link retranslateEntries} runs leave in
 * `.verbatra-local/run-history.jsonl`: per run the time, trigger, provider, token usage, the cost
 * frozen at the rates the config held then, and per locale the counts and, when measured, the
 * coverage. It writes nothing and calls no provider.
 *
 * A record holds counts only, never a key name or a translation. A dry run is not recorded, and
 * neither is a run that left no trace: every locale succeeded and nothing was translated, served
 * from the cache, reused, generated, pruned, refused or failed, and no tokens were spent. A run
 * that failed or was refused records too. The file keeps the newest 1,000 records. The read is
 * total: a missing file is an empty history, an unreadable or oversized (over 8 MiB) file is an
 * empty history with `unavailable` set, and a single bad line, one that is not valid UTF-8
 * included, is dropped and counted in `unreadableRecords`, so this call throws nothing.
 *
 * @param input - The optional working directory and record limit.
 * @param deps - Optional file-system override.
 * @returns The newest records, how many the file holds, and how many lines could not be read.
 */
export async function runHistory(
  input: RunHistoryInput = {},
  deps: RunHistoryDeps = {},
): Promise<RunHistoryResult> {
  const cwd = input.cwd ?? process.cwd();
  const read = await readRunHistoryFile(runHistoryFilePath(cwd), deps.fs ?? defaultFs);
  return {
    records: read.records.slice(-clampedLimit(input.limit)).reverse(),
    total: read.records.length,
    unreadableRecords: read.unreadableRecords,
    ...(read.unavailable === undefined ? {} : { unavailable: read.unavailable }),
  };
}
