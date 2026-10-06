import { contentHash } from "@verbatra/core";
import type { AdapterRegistry } from "@verbatra/format-adapters";
import { projectCwd } from "../config/project-root.js";
import type { VerbatraConfig } from "../config/schema.js";
import { SdkError } from "../errors.js";
import { defaultFs, type SdkFs } from "../fs.js";
import type { MachineClassOrigin } from "../lock/key-provenance.js";
import {
  assertLockAcquireTimeout,
  type LockWaitListener,
  recordLockOptions,
  withLocaleWriteLock,
  withLockFileGuard,
  writeLockKeyFor,
  writeLockOptions,
} from "../lock/locale-write-lock.js";
import { assertLocksHeld } from "../lock/lock-ownership.js";
import { planProvenanceRecords } from "../lock/provenance-file.js";
import { diffLocalesWithSource, type LocaleDiffResult } from "./diff-locales.js";
import { carryOverBeforeWrite } from "./locale-carry-over.js";
import { assertReviewer, decidedRecord } from "./review-decision.js";
import { machineClassValues } from "./review-scan.js";
import { selectLocales } from "./select-locales.js";

/** Input for {@link approveLocale}. */
export interface ApproveLocaleInput {
  /** The resolved project config, normally from {@link loadConfig}. */
  readonly config: VerbatraConfig;
  /** Directory the `files.pattern` is resolved against. Defaults to the project root of a config that {@link loadConfig} returned, else the process working directory. */
  readonly cwd?: string;
  /** The target locale whose review queue is approved. Must be a configured target locale. */
  readonly locale: string;
  /**
   * Approve only the queued values with one of these origins, for a reviewer who has looked at,
   * say, every fuzzy match. Defaults to every {@link MachineClassOrigin}.
   */
  readonly origins?: readonly MachineClassOrigin[];
  /**
   * Free text naming the reviewer, with the rules of {@link ReviewDecisionInput.reviewer}. It is
   * stored on every approved record.
   */
  readonly reviewer?: string;
  /**
   * Called while waiting on another process's write lock for the locale. Never called for a lock
   * this process holds itself.
   */
  readonly onLockWait?: LockWaitListener;
  /**
   * How long, in milliseconds, to wait for the locale's write lock before failing with
   * `LOCK_CONTENDED`. Defaults to ten minutes.
   */
  readonly lockAcquireTimeoutMs?: number;
}

/** Injectable dependencies for {@link approveLocale}. */
export interface ApproveLocaleDeps {
  /** Format-adapter registry to resolve the configured format. Defaults to the built-in registry. */
  readonly adapterRegistry?: AdapterRegistry;
  /** File-system port. Defaults to the real file system. */
  readonly fs?: SdkFs;
}

/** The outcome of {@link approveLocale}. */
export interface ApproveLocaleResult {
  /** The target locale. */
  readonly locale: string;
  /** The keys approved by this call, in source order. */
  readonly approved: readonly string[];
  /**
   * Queued keys left unreviewed because their source text changed since the value was written, or
   * the lock file has no entry for them (a fuzzy match is written without one), in source order.
   * Edit or retranslate them, then approve them.
   */
  readonly sourceChanged: readonly string[];
}

interface Approvable {
  readonly key: string;
  readonly value: string;
  readonly sourceHash: string;
}

interface Candidates {
  readonly approvable: readonly Approvable[];
  readonly sourceChanged: readonly string[];
}

function currentSourceHash(result: LocaleDiffResult, key: string): string | undefined {
  const sourceEntry = result.source.entries.get(key);
  const baseline = result.baseline.get(key);
  return sourceEntry !== undefined && baseline === contentHash(sourceEntry) ? baseline : undefined;
}

function candidatesOf(
  result: LocaleDiffResult,
  origins: ReadonlySet<string> | undefined,
): Candidates {
  const approvable: Approvable[] = [];
  const sourceChanged: string[] = [];
  for (const { key, value, provenance } of machineClassValues(
    result,
    result.provenance ?? new Map(),
  )) {
    if (
      provenance.reviewState !== "unreviewed" ||
      (origins !== undefined && !origins.has(provenance.origin))
    ) {
      continue;
    }
    const sourceHash = currentSourceHash(result, key);
    if (sourceHash === undefined) {
      sourceChanged.push(key);
    } else {
      approvable.push({ key, value, sourceHash });
    }
  }
  return { approvable, sourceChanged };
}

function notRecordable(locale: string, reason: "newer-version" | "too-large"): SdkError {
  const why =
    reason === "newer-version"
      ? "verbatra.provenance.json was written by a newer verbatra. Upgrade verbatra and try again."
      : "recording them would grow verbatra.provenance.json past the size verbatra reads back.";
  return new SdkError(
    "PROVENANCE_FILE_UNWRITABLE",
    `The approvals in ${locale} were not recorded: ${why}`,
  );
}

async function recordApprovals(
  cwd: string,
  fs: SdkFs,
  locale: string,
  approvable: readonly Approvable[],
  reviewer: string | undefined,
): Promise<void> {
  const byKey = new Map(approvable.map((entry) => [entry.key, entry]));
  const plan = await planProvenanceRecords(cwd, fs, locale, byKey, (entry, prior) =>
    decidedRecord(prior, entry.value, {
      reviewState: "approved",
      reviewedSourceHash: entry.sourceHash,
      ...(reviewer !== undefined ? { reviewer } : {}),
    }),
  );
  if (plan.kind === "newer-version" || plan.kind === "too-large") {
    throw notRecordable(locale, plan.kind);
  }
  if (plan.kind === "write") {
    await assertLocksHeld();
    await fs.writeFile(plan.path, plan.content);
  }
}

/**
 * Approves a locale's whole review queue in one call: every value {@link reviewQueue} lists for the
 * locale, optionally narrowed to some origins, that is up to date with its source. It writes only
 * the provenance file (`verbatra.provenance.json`), in one write, never a locale file or the
 * lock-file, and calls no provider.
 *
 * Each approval is recorded exactly as {@link approveEntry} records one: on the value, with the
 * source hash it was given against, so a later write that changes the value, or a change of its
 * source, puts the key back in the queue. Unlike {@link approveEntry}, it takes no expected value:
 * it approves what the queue holds when the call runs, under the locale's write lock, so a value a
 * running translation writes afterwards is not approved. Show the reviewer the queue first. A value
 * whose source changed since it was written is left unreviewed and listed in
 * {@link ApproveLocaleResult.sourceChanged}. A queue with nothing to approve writes nothing.
 *
 * @param input - The config, the locale, the optional origin filter, and an optional reviewer.
 * @param deps - Optional adapter registry and file-system overrides.
 * @returns The keys approved and the keys left because their source changed.
 *
 * @throws {@link SdkError} `REVIEWER_INVALID`: the reviewer is empty, longer than 64 characters, or
 * contains a control character.
 * @throws {@link SdkError} `LOCK_TIMEOUT_INVALID`: `lockAcquireTimeoutMs` is not a whole number of
 * milliseconds of at least 0. Thrown before anything is read or locked.
 * @throws {@link SdkError} `UNKNOWN_FORMAT`: no adapter is registered for the configured format.
 * @throws {@link SdkError} `UNKNOWN_LOCALE`: the requested locale is not a configured target locale.
 * @throws {@link SdkError} `LOCALE_LAYOUT_INVALID`: the `files.pattern` and `files.localeStyle`
 * cannot be combined, or the locale has no valid path spelling under that style.
 * @throws {@link SdkError} `LOCALE_PATH_COLLISION`: two configured locales resolve to the same path.
 * @throws {@link SdkError} `SOURCE_UNREADABLE`: the source locale file does not exist.
 * @throws {@link SdkError} `SOURCE_INVALID`: the source locale file could not be parsed.
 * @throws {@link SdkError} `LOCK_CONTENDED`: the locale's write lock or the lock-file guard could
 * not be acquired before the timeout elapsed.
 * @throws {@link SdkError} `LOCALE_STATE_NOT_CARRIED_OVER`: state recorded under a respelled code
 * of the locale could not be moved to it first, so nothing was written.
 * @throws {@link SdkError} `LOCK_FILE_INVALID`: the lock-file is corrupt, oversized, or at an
 * unsupported version.
 * @throws {@link SdkError} `PROVENANCE_FILE_INVALID`: the provenance file is corrupt, oversized, or
 * structurally wrong.
 * @throws {@link SdkError} `PROVENANCE_FILE_UNWRITABLE`: the provenance file is from a newer
 * verbatra, or the approvals would grow it past the size verbatra reads back. Nothing is written.
 * @throws `AdapterError`: the adapter refused the target locale file because it is malformed. Its
 * own code is preserved rather than remapped onto an {@link SdkErrorCode}.
 */
export async function approveLocale(
  input: ApproveLocaleInput,
  deps: ApproveLocaleDeps = {},
): Promise<ApproveLocaleResult> {
  assertReviewer(input.reviewer);
  assertLockAcquireTimeout(input.lockAcquireTimeoutMs);
  const config = input.config;
  const cwd = projectCwd(input);
  const fs = deps.fs ?? defaultFs;
  const [locale = input.locale] = selectLocales(config, [input.locale]);
  const origins = input.origins === undefined ? undefined : new Set<string>(input.origins);
  await carryOverBeforeWrite(cwd, fs, locale, writeLockOptions(input));
  return withLocaleWriteLock(
    cwd,
    writeLockKeyFor(config.format, locale),
    fs,
    () =>
      withLockFileGuard(
        cwd,
        fs,
        async () => {
          const { results } = await diffLocalesWithSource(
            { config, cwd, locales: [locale] },
            { ...deps, fs },
          );
          const [result] = results;
          /* v8 ignore next 3 -- diffLocalesWithSource returns one result per requested locale, and exactly one was requested. */
          if (result === undefined) {
            throw new SdkError("UNKNOWN_LOCALE", `Locale "${locale}" could not be resolved.`);
          }
          const { approvable, sourceChanged } = candidatesOf(result, origins);
          await recordApprovals(cwd, fs, locale, approvable, input.reviewer);
          return {
            locale,
            approved: approvable.map((value) => value.key),
            sourceChanged,
          };
        },
        recordLockOptions(input),
      ),
    writeLockOptions(input),
  );
}
