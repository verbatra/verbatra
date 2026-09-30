import { defaultFs, type SdkFs } from "../fs.js";
import { readRunStatusFile, runStatusFilePath } from "../run-status/run-status-file.js";
import type { RunStatusFile } from "../run-status/types.js";

/** Input for {@link runStatus}. */
export interface RunStatusInput {
  /** Directory holding the `.verbatra-local` status directory. Defaults to the process working directory. */
  readonly cwd?: string;
}

/** Injectable dependencies for {@link runStatus}. Every field has a working default. */
export interface RunStatusDeps {
  /** File-system port. Defaults to the real file system. */
  readonly fs?: SdkFs;
}

/**
 * The result of {@link runStatus}. Having no readable status file is a normal state, not an error:
 * it simply means no non-dry-run has completed in this directory yet.
 */
export type RunStatusResult =
  | {
      /** No usable status file was found, so there is nothing to report. */
      readonly available: false;
    }
  | ({
      /** A status file was found and parsed; the {@link RunStatusFile} fields are spread alongside. */
      readonly available: true;
    } & RunStatusFile);

/**
 * Reads the review-flag and token-usage snapshot that the last non-dry-run {@link translate} or
 * {@link watch} left behind in `.verbatra-local/run-status.json`. It writes nothing and calls no
 * provider.
 *
 * This exists so a tool started after a run, such as a dashboard opened once translation finished,
 * can still show which keys were flagged for review and what the run cost, without re-running
 * anything.
 *
 * The read is deliberately total: a missing, oversized, unparseable, schema-invalid, or
 * wrong-version file all report `available: false` rather than throwing, and so does an injected
 * `deps.fs` whose read rejects, because stale or unreachable local status should never break the
 * tool reading it. This call throws nothing. A review reason written by a newer verbatra that this
 * version does not know is ignored rather than making the whole file unusable, and an entry left
 * with no known reason is dropped.
 *
 * @param input - The optional working directory.
 * @param deps - Optional file-system override.
 * @returns The persisted run status, or `available: false` when none is usable.
 */
export async function runStatus(
  input: RunStatusInput = {},
  deps: RunStatusDeps = {},
): Promise<RunStatusResult> {
  const cwd = input.cwd ?? process.cwd();
  const fs = deps.fs ?? defaultFs;
  const file = await readRunStatusFile(runStatusFilePath(cwd), fs);
  if (file === undefined) {
    return { available: false };
  }
  return { available: true, ...file };
}
