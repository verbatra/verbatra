import { defaultFs, type SdkFs } from "../fs.js";
import { lockFilePath, readLockFile } from "./lock-file.js";
import type { LockFile } from "./types.js";

/** Input for {@link loadLockFile}. */
export interface LoadLockFileInput {
  /**
   * Directory holding the lock-file. Defaults to the process working directory, even when the
   * config was found in a parent directory: pass the root {@link resolveProjectRoot} returns.
   */
  readonly cwd?: string;
}

/** Injectable dependencies for {@link loadLockFile}. Every field has a working default. */
export interface LoadLockFileDeps {
  /** File-system port. Defaults to the real file system. */
  readonly fs?: SdkFs;
}

/**
 * Reads the project's lock-file. Use it when you need the recorded baseline hashes themselves;
 * {@link lockState} is the better choice when you want the drift those hashes imply.
 *
 * A project with no lock-file yet reads as an empty lock-file at the current version rather than an
 * error, so a first run and a lost file behave the same way. A lock-file that exists but cannot be
 * trusted is a different matter and throws, because silently treating a corrupt baseline as empty
 * would make every key look stale and trigger a full re-translation.
 *
 * @param input - The optional working directory.
 * @param deps - Optional file-system override.
 * @returns The lock-file's contents, or an empty lock-file when none exists.
 *
 * @throws {@link SdkError} `LOCK_FILE_INVALID`: the lock-file exists but is oversized, not valid
 * JSON, structurally wrong, or at an unsupported version.
 */
export async function loadLockFile(
  input: LoadLockFileInput = {},
  deps: LoadLockFileDeps = {},
): Promise<LockFile> {
  const cwd = input.cwd ?? process.cwd();
  const fs = deps.fs ?? defaultFs;
  return readLockFile(lockFilePath(cwd), fs);
}
