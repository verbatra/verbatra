import type { AdapterRegistry, FormatAdapter } from "@verbatra/format-adapters";
import {
  limitsFilePath,
  MAX_LIMITS_ENTRIES,
  MAX_LIMITS_FILE_BYTES,
  MAX_LIMITS_KEY_LENGTH,
  readLimitsFile,
  serializeLimits,
} from "../config/limits-file.js";
import { maxLengthValueSchema } from "../config/max-length.js";
import { projectCwd } from "../config/project-root.js";
import type { VerbatraConfig } from "../config/schema.js";
import { SdkError } from "../errors.js";
import { defaultFs, type SdkFs } from "../fs.js";
import {
  assertLockAcquireTimeout,
  limitsGuardPath,
  withLimitsGuard,
  writeLockOptions,
} from "../lock/locale-write-lock.js";
import { assertLocksHeld } from "../lock/lock-ownership.js";
import { selectAdapter } from "../selection/select-adapter.js";
import { readSource } from "./source.js";
import { unwritableFileMessage } from "./write-target.js";

/** Input for {@link setKeyLengthLimit}. */
export interface SetKeyLengthLimitInput {
  /** The resolved project config, normally from {@link loadConfig}. */
  readonly config: VerbatraConfig;
  /** Directory the `files.pattern` and `verbatra.limits.json` are resolved against. Defaults to the project root of the config object {@link loadConfig} returned, else the process working directory. */
  readonly cwd?: string;
  /** The key to limit. Must exist in the source resource, and the config's `maxLength` must not set it. */
  readonly key: string;
  /** The most characters a value of the key may have, a whole number of at least 1, or `null` to remove the key's entry from the limits file. */
  readonly maxLength: number | null;
  /**
   * How long, in milliseconds, to wait for the project's limits write lock before failing with
   * `LOCK_CONTENDED`. Defaults to ten minutes.
   */
  readonly lockAcquireTimeoutMs?: number;
}

/** Injectable dependencies for {@link setKeyLengthLimit}. Every field has a working default. */
export interface SetKeyLengthLimitDeps {
  /** Format-adapter registry to resolve the configured format. Defaults to the built-in registry. */
  readonly adapterRegistry?: AdapterRegistry;
  /** File-system port. Defaults to the real file system. */
  readonly fs?: SdkFs;
}

/** What {@link setKeyLengthLimit} did. */
export interface SetKeyLengthLimitResult {
  /** The key the call was about. */
  readonly key: string;
  /** The limit the file now holds for the key, `null` when it holds none. */
  readonly maxLength: number | null;
  /** `false` when the file already held exactly this and nothing was written. */
  readonly changed: boolean;
}

function invalid(detail: string): SdkError {
  return new SdkError("LENGTH_LIMIT_INVALID", detail);
}

function assertValidInput(input: SetKeyLengthLimitInput): void {
  const { key, maxLength, config } = input;
  if (typeof key !== "string" || key.length === 0 || key.length > MAX_LIMITS_KEY_LENGTH) {
    throw invalid(`The key must be 1 to ${MAX_LIMITS_KEY_LENGTH} characters long.`);
  }
  if (maxLength !== null && !maxLengthValueSchema.safeParse(maxLength).success) {
    throw invalid(
      `The limit must be a whole number from 1 to ${Number.MAX_SAFE_INTEGER}, or null to remove it, got ${String(maxLength)}.`,
    );
  }
  if (
    maxLength !== null &&
    config.maxLength !== undefined &&
    Object.hasOwn(config.maxLength, key)
  ) {
    throw invalid(
      `The config's maxLength already sets "${key}", and it wins over verbatra.limits.json. Change it in the config.`,
    );
  }
}

interface SourceLookup {
  readonly inSource: boolean;
  readonly failure?: unknown;
}

async function lookUpKey(
  input: SetKeyLengthLimitInput,
  cwd: string,
  fs: SdkFs,
  adapter: FormatAdapter,
): Promise<SourceLookup> {
  try {
    const source = await readSource(input.config, cwd, fs, adapter);
    return { inSource: source.resource.entries.has(input.key) };
  } catch (error) {
    if (input.maxLength !== null) {
      throw error;
    }
    return { inSource: false, failure: error };
  }
}

function unknownKey(key: string): SdkError {
  return new SdkError("UNKNOWN_KEY", `The key "${key}" was not found in the source resource.`);
}

function unusableFile(message: string): SdkError {
  return new SdkError("LIMITS_FILE_UNUSABLE", `${message}. Nothing was written.`);
}

async function applyLimit(
  input: SetKeyLengthLimitInput,
  path: string,
  lookup: SourceLookup,
  fs: SdkFs,
): Promise<SetKeyLengthLimitResult> {
  const read = await readLimitsFile(path, fs);
  if (read.kind === "unusable") {
    throw unusableFile(read.unusable.message);
  }
  const { key, maxLength } = input;
  const held = read.limits.get(key);
  if (!lookup.inSource && !(maxLength === null && held !== undefined)) {
    throw lookup.failure ?? unknownKey(key);
  }
  const next = new Map(read.limits);
  if (maxLength === null) {
    next.delete(key);
  } else {
    next.set(key, maxLength);
  }
  if (held === (maxLength ?? undefined)) {
    return { key, maxLength, changed: false };
  }
  if (next.size > MAX_LIMITS_ENTRIES) {
    throw unusableFile(
      `verbatra.limits.json would hold more than the ${MAX_LIMITS_ENTRIES} entries verbatra reads`,
    );
  }
  const serialized = serializeLimits(next);
  if (Buffer.byteLength(serialized, "utf8") > MAX_LIMITS_FILE_BYTES) {
    throw unusableFile(
      `verbatra.limits.json would exceed the maximum allowed size of ${MAX_LIMITS_FILE_BYTES} bytes`,
    );
  }
  await assertLocksHeld();
  try {
    await fs.writeFile(path, serialized);
  } catch (error) {
    throw new SdkError(
      "LIMITS_FILE_UNUSABLE",
      `verbatra.limits.json could not be written: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  return { key, maxLength, changed: true };
}

/**
 * Sets, changes, or removes one key's length limit in `verbatra.limits.json`, the file beside the
 * lock file that holds limits the config does not. A limit is advisory: a value over it is flagged
 * `MAX_LENGTH_EXCEEDED` for review and never refused.
 *
 * The key must exist in the source resource, and a limit for a key the config's own `maxLength`
 * sets is refused, because the config wins and the file could not change anything for it. Passing
 * `null` removes the key's entry from the file, whatever the config says, also for a key that has
 * since left the source or while the source cannot be read, so a stale or shadowed entry can be
 * cleaned up. The file is written sorted, with a final newline.
 *
 * The whole read-modify-write runs under a project-wide limits lock, so two concurrent calls, from
 * this process or another, are serialized and neither update is lost, and the file is replaced
 * atomically. A call that leaves the file as it is succeeds and writes nothing. A file that cannot
 * be read as a limits file is never overwritten.
 *
 * @param input - The config, the key, and the limit or `null`.
 * @param deps - Optional adapter registry and file-system overrides.
 * @returns The key, the limit the file holds for it afterwards, and whether anything was written.
 *
 * @throws {@link SdkError} `LENGTH_LIMIT_INVALID`: the key is empty or longer than 1024 characters,
 * the limit is not a whole number from 1 to `Number.MAX_SAFE_INTEGER` or `null`, or the limit is a
 * number and the config's `maxLength` sets the key. Thrown before anything is read or locked.
 * @throws {@link SdkError} `LOCK_TIMEOUT_INVALID`: `lockAcquireTimeoutMs` is not a whole number of
 * milliseconds of at least 0. Thrown before anything is read or locked.
 * @throws {@link SdkError} `UNKNOWN_FORMAT`: no adapter is registered for the configured format.
 * @throws {@link SdkError} `LOCALE_LAYOUT_INVALID`: the `files.pattern` and `files.localeStyle`
 * cannot be combined, or the locale has no valid path spelling under that style.
 * @throws {@link SdkError} `LOCALE_PATH_COLLISION`: two configured locales resolve to the same path.
 * @throws {@link SdkError} `SOURCE_UNREADABLE`: the source locale file does not exist.
 * @throws {@link SdkError} `SOURCE_INVALID`: the source locale file could not be parsed.
 * @throws {@link SdkError} `UNKNOWN_KEY`: the key is not present in the source resource and the
 * file holds no entry of that name to remove.
 * @throws {@link SdkError} `LOCK_CONTENDED`: the project's limits write lock could not be acquired
 * before the timeout elapsed, could not be reclaimed from an abandoned holder, or was taken over by
 * another process before the file was written.
 * @throws {@link SdkError} `RUN_CANCELLED`: {@link releaseHeldLocks} was running when the call
 * went to take the write lock, so that lock was refused.
 * @throws {@link SdkError} `LIMITS_FILE_UNUSABLE`: the limits file cannot be read as one (over
 * 1 MiB, not UTF-8 or JSON, another shape, a newer version, or more than 10,000 entries), the
 * write would grow it past 10,000 entries or 1 MiB, or the file or the limits lock could not be
 * written. Nothing is overwritten.
 */
export async function setKeyLengthLimit(
  input: SetKeyLengthLimitInput,
  deps: SetKeyLengthLimitDeps = {},
): Promise<SetKeyLengthLimitResult> {
  assertLockAcquireTimeout(input.lockAcquireTimeoutMs);
  assertValidInput(input);
  const { config } = input;
  const cwd = projectCwd(input);
  const fs = deps.fs ?? defaultFs;
  const adapter = selectAdapter(config.format, deps.adapterRegistry, deps.fs);
  const lookup = await lookUpKey(input, cwd, fs, adapter);
  const path = limitsFilePath(cwd);

  let locked = false;
  let applyFailure: { readonly error: unknown } | undefined;
  try {
    return await withLimitsGuard(
      cwd,
      fs,
      async () => {
        locked = true;
        try {
          return await applyLimit(input, path, lookup, fs);
        } catch (error) {
          applyFailure = { error };
          throw error;
        }
      },
      writeLockOptions({
        ...(input.lockAcquireTimeoutMs !== undefined
          ? { lockAcquireTimeoutMs: input.lockAcquireTimeoutMs }
          : {}),
      }),
    );
  } catch (error) {
    throw guardFailure(error, applyFailure, locked, cwd);
  }
}

function guardFailure(
  error: unknown,
  applyFailure: { readonly error: unknown } | undefined,
  locked: boolean,
  cwd: string,
): unknown {
  if (applyFailure !== undefined) {
    return applyFailure.error;
  }
  if (error instanceof SdkError) {
    return error;
  }
  const message = unwritableFileMessage("the limits write lock", limitsGuardPath(cwd), cwd, error);
  return new SdkError(
    "LIMITS_FILE_UNUSABLE",
    locked
      ? `${message} The limit was saved, but the lock could not be released and stays in place until a later run reclaims it after this process exits.`
      : message,
    { cause: error },
  );
}
