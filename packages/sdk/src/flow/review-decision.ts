import { Buffer } from "node:buffer";
import { relative, sep } from "node:path";
import { contentHash, type LocaleResource, type TranslationEntry } from "@verbatra/core";
import type { AdapterRegistry, FormatAdapter } from "@verbatra/format-adapters";
import { evictMemoryValue } from "../cache/translation-memory.js";
import type { VerbatraConfig } from "../config/schema.js";
import { errorMessage, SdkError } from "../errors.js";
import { type BoundedFileRead, defaultFs, type SdkFs } from "../fs.js";
import { createLocalePathResolver } from "../locale-path/resolver.js";
import { type KeyProvenance, keyProvenance } from "../lock/key-provenance.js";
import {
  assertLockAcquireTimeout,
  type LocaleWriteLockOptions,
  type LockWaitListener,
  recordLockOptions,
  withLocaleWriteLock,
  withLockFileGuard,
  writeLockKeyFor,
  writeLockOptions,
} from "../lock/locale-write-lock.js";
import {
  baselineFor,
  lockFilePath,
  readLockFile,
  updateLockFileLocaleUnguarded,
} from "../lock/lock-file.js";
import { assertLocksHeld } from "../lock/lock-ownership.js";
import {
  MAX_PROVENANCE_FILE_BYTES,
  type ProvenanceRecord,
  type ProvenanceRecordPlan,
  type ProvenanceReviewState,
  planProvenanceRecord,
  provenanceFilePath,
  valueHash,
} from "../lock/provenance-file.js";
import { selectAdapter } from "../selection/select-adapter.js";
import { readTarget } from "./diff-locales.js";
import { carryOverBeforeWrite } from "./locale-carry-over.js";
import { selectLocales } from "./select-locales.js";
import { readSource } from "./source.js";
import { writeTargetResource } from "./write-target.js";

/** Input for {@link approveEntry} and {@link rejectEntry}. */
export interface ReviewDecisionInput {
  /** The resolved project config, normally from {@link loadConfig}. */
  readonly config: VerbatraConfig;
  /** Directory the `files.pattern` is resolved against. Defaults to the process working directory. */
  readonly cwd?: string;
  /** The target locale the reviewed value belongs to. Must be a configured target locale. */
  readonly locale: string;
  /** The key whose value was reviewed. Must exist in the source resource. */
  readonly key: string;
  /**
   * The translation the reviewer saw. The decision is refused when the key's current value is a
   * different one, so a value nobody looked at is never approved or rejected.
   */
  readonly expectedValue: string;
  /**
   * Free text naming the reviewer, at most 64 characters with no control characters. It is stored
   * in the committed provenance file, so it is public; nothing is recorded when it is left out.
   */
  readonly reviewer?: string;
  /**
   * Called while waiting on another process's write lock for the locale, so a caller can explain a
   * stall instead of appearing to hang. Never called for a lock this process holds itself.
   */
  readonly onLockWait?: LockWaitListener;
  /**
   * How long, in milliseconds, to wait for the locale's write lock before failing with
   * `LOCK_CONTENDED`. Defaults to ten minutes. It does not bound the lock-file guard taken to
   * record the decision, which always allows the ten-minute default.
   */
  readonly lockAcquireTimeoutMs?: number;
}

/** Injectable dependencies for {@link approveEntry} and {@link rejectEntry}. */
export interface ReviewDecisionDeps {
  /** Format-adapter registry to resolve the configured format. Defaults to the built-in registry. */
  readonly adapterRegistry?: AdapterRegistry;
  /** File-system port. Defaults to the real file system. */
  readonly fs?: SdkFs;
}

/** The outcome of {@link approveEntry} or {@link rejectEntry}: the decision as it was recorded. */
export interface ReviewDecisionResult {
  /** The target locale the decision applies to. */
  readonly locale: string;
  /** The key the decision applies to. */
  readonly key: string;
  /** The key's provenance as recorded after the decision. */
  readonly provenance: KeyProvenance;
}

const MAX_REVIEWER_LENGTH = 64;

function isControlCharacter(character: string): boolean {
  const code = character.codePointAt(0) ?? 0;
  return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
}

interface ReviewContext {
  readonly config: VerbatraConfig;
  readonly cwd: string;
  readonly fs: SdkFs;
  readonly adapter: FormatAdapter;
  readonly locale: string;
  readonly key: string;
  readonly sourceEntry: TranslationEntry;
  readonly writeLock: LocaleWriteLockOptions;
  readonly recordLock: LocaleWriteLockOptions;
}

interface ReviewedValue {
  readonly target: LocaleResource;
  readonly value: string;
}

interface Decision {
  readonly reviewState: ProvenanceReviewState;
  readonly reviewer?: string;
  readonly reviewedSourceHash?: string;
}

function assertReviewer(reviewer: string | undefined): void {
  if (reviewer === undefined) {
    return;
  }
  if (
    reviewer.length === 0 ||
    reviewer.length > MAX_REVIEWER_LENGTH ||
    [...reviewer].some(isControlCharacter)
  ) {
    throw new SdkError(
      "REVIEWER_INVALID",
      `The reviewer name must be 1 to ${MAX_REVIEWER_LENGTH} characters long and contain no control characters.`,
    );
  }
}

function assertExpectedValue(expectedValue: unknown): void {
  if (typeof expectedValue !== "string") {
    throw new SdkError(
      "REVIEW_VALUE_CHANGED",
      "The expectedValue must be the translation the reviewer saw, as a string, so nothing was recorded.",
    );
  }
}

async function reviewContext(
  input: ReviewDecisionInput,
  deps: ReviewDecisionDeps,
): Promise<ReviewContext> {
  assertReviewer(input.reviewer);
  assertExpectedValue(input.expectedValue);
  assertLockAcquireTimeout(input.lockAcquireTimeoutMs);
  const config = input.config;
  const cwd = input.cwd ?? process.cwd();
  const fs = deps.fs ?? defaultFs;
  const adapter = selectAdapter(config.format, deps.adapterRegistry, deps.fs);
  const [locale] = selectLocales(config, [input.locale]);
  /* v8 ignore next 3 -- selectLocales with a one-element requested array either throws UNKNOWN_LOCALE or returns that exact element; `locale` is never undefined here. */
  if (locale === undefined) {
    throw new SdkError("UNKNOWN_LOCALE", `Locale "${input.locale}" could not be resolved.`);
  }
  const source = await readSource(config, cwd, fs, adapter);
  const sourceEntry = source.resource.entries.get(input.key);
  if (sourceEntry === undefined) {
    throw new SdkError(
      "UNKNOWN_KEY",
      `The key "${input.key}" was not found in the source resource.`,
    );
  }
  const writeLock = writeLockOptions(input);
  await carryOverBeforeWrite(cwd, fs, locale, writeLock);
  return {
    config,
    cwd,
    fs,
    adapter,
    locale,
    key: input.key,
    sourceEntry,
    writeLock,
    recordLock: recordLockOptions(input),
  };
}

async function reviewedValue(context: ReviewContext, expected: string): Promise<ReviewedValue> {
  const target = await readTarget(
    context.cwd,
    context.config,
    context.adapter,
    context.fs,
    context.locale,
  );
  const current = target.entries.get(context.key);
  if (current === undefined || valueHash(current.value) !== valueHash(expected)) {
    throw new SdkError(
      "REVIEW_VALUE_CHANGED",
      `The translation of "${context.key}" in ${context.locale} is no longer the value that was reviewed. Reload it and review it again.`,
    );
  }
  return { target, value: current.value };
}

function withoutReview(record: ProvenanceRecord): ProvenanceRecord {
  const { reviewState: _state, reviewer: _reviewer, reviewedSourceHash: _hash, ...rest } = record;
  return rest;
}

function decidedRecord(
  prior: ProvenanceRecord | undefined,
  value: string,
  decision: Decision,
): ProvenanceRecord {
  const hash = valueHash(value);
  const same = prior !== undefined && prior.valueHash === hash ? prior : undefined;
  const base: ProvenanceRecord =
    same !== undefined ? withoutReview(same) : { origin: "unknown", valueHash: hash };
  const reviewer =
    decision.reviewer ?? (same?.reviewState === decision.reviewState ? same.reviewer : undefined);
  return {
    ...base,
    reviewState: decision.reviewState,
    ...(reviewer !== undefined ? { reviewer } : {}),
    ...(decision.reviewedSourceHash !== undefined
      ? { reviewedSourceHash: decision.reviewedSourceHash }
      : {}),
  };
}

function notRecordable(context: ReviewContext, reason: "newer-version" | "too-large"): SdkError {
  const why =
    reason === "newer-version"
      ? "verbatra.provenance.json was written by a newer verbatra. Upgrade verbatra and try again."
      : "recording it would grow verbatra.provenance.json past the size verbatra reads back.";
  return new SdkError(
    "PROVENANCE_FILE_UNWRITABLE",
    `The review decision on "${context.key}" in ${context.locale} was not recorded: ${why}`,
  );
}

async function planDecision(
  context: ReviewContext,
  value: string,
  decision: Decision,
): Promise<Extract<ProvenanceRecordPlan, { kind: "write" | "unchanged" }>> {
  const plan = await planProvenanceRecord(
    context.cwd,
    context.fs,
    context.locale,
    context.key,
    (prior) => decidedRecord(prior, value, decision),
  );
  if (plan.kind === "newer-version" || plan.kind === "too-large") {
    throw notRecordable(context, plan.kind);
  }
  return plan;
}

async function lockSourceHash(context: ReviewContext): Promise<string | undefined> {
  const lock = await readLockFile(lockFilePath(context.cwd), context.fs);
  return baselineFor(lock, context.locale).get(context.key);
}

const MAX_TARGET_SNAPSHOT_BYTES = 64 * 1024 * 1024;

function targetPath(context: ReviewContext): string {
  return createLocalePathResolver(context.cwd, context.config).pathFor(context.locale);
}

async function targetSnapshot(context: ReviewContext, path: string): Promise<Uint8Array> {
  const snapshot = await context.fs.readBytesBounded(path, MAX_TARGET_SNAPSHOT_BYTES);
  if (snapshot.kind !== "ok") {
    throw new SdkError(
      "REVIEW_REJECT_UNSUPPORTED",
      `The ${context.locale} locale file could not be read in full to keep a copy to restore, so "${context.key}" was not rejected and nothing was written.`,
    );
  }
  return snapshot.bytes;
}

async function removeValue(
  context: ReviewContext,
  target: LocaleResource,
  path: string,
): Promise<void> {
  const remaining = new Map(target.entries);
  remaining.delete(context.key);
  await writeTargetResource(
    context.adapter,
    {
      locale: context.locale,
      namespace: target.namespace,
      format: context.config.format,
      entries: remaining,
    },
    path,
    context.cwd,
    {
      sourcePath: createLocalePathResolver(context.cwd, context.config).pathFor(
        context.config.sourceLocale,
      ),
    },
  );
  const after = await readTarget(
    context.cwd,
    context.config,
    context.adapter,
    context.fs,
    context.locale,
  );
  if (after.entries.has(context.key)) {
    throw new SdkError(
      "REVIEW_REJECT_UNSUPPORTED",
      `The ${context.config.format} format keeps a translation that verbatra drops from the file, so "${context.key}" in ${context.locale} cannot be rejected. The file was left as it was; edit or retranslate the key instead.`,
    );
  }
}

function displayPath(context: ReviewContext, path: string): string {
  return relative(context.cwd, path).split(sep).join("/");
}

async function restoreProvenance(context: ReviewContext, before: BoundedFileRead): Promise<void> {
  const provenancePath = provenanceFilePath(context.cwd);
  await assertLocksHeld();
  if (before.kind === "ok") {
    await context.fs.writeFile(provenancePath, before.content);
    return;
  }
  if (before.kind === "missing") {
    await context.fs.deleteFile(provenancePath);
    return;
  }
  throw new Error("no copy of the provenance file was kept");
}

async function localeFileUnchanged(
  context: ReviewContext,
  path: string,
  snapshot: Uint8Array,
): Promise<boolean> {
  try {
    const now = await context.fs.readBytesBounded(path, MAX_TARGET_SNAPSHOT_BYTES);
    return now.kind === "ok" && Buffer.from(now.bytes).equals(Buffer.from(snapshot));
  } catch {
    return false;
  }
}

async function provenanceFileUnchanged(
  context: ReviewContext,
  before: BoundedFileRead,
): Promise<boolean> {
  try {
    const now = await context.fs.readFileBounded(
      provenanceFilePath(context.cwd),
      MAX_PROVENANCE_FILE_BYTES,
    );
    return before.kind === "ok"
      ? now.kind === "ok" && now.content === before.content
      : now.kind === before.kind;
  } catch {
    return false;
  }
}

async function restoreLocaleFile(
  context: ReviewContext,
  path: string,
  snapshot: Uint8Array,
): Promise<boolean> {
  if (await localeFileUnchanged(context, path, snapshot)) {
    return true;
  }
  try {
    await assertLocksHeld();
    await context.fs.writeBytes(path, snapshot);
    return true;
  } catch {
    return false;
  }
}

async function restoreProvenanceFile(
  context: ReviewContext,
  before: BoundedFileRead,
): Promise<boolean> {
  if (await provenanceFileUnchanged(context, before)) {
    return true;
  }
  try {
    await restoreProvenance(context, before);
    return true;
  } catch {
    return false;
  }
}

async function restoreAfterFailedReject(
  context: ReviewContext,
  path: string,
  snapshot: Uint8Array,
  provenanceBefore: BoundedFileRead,
  failure: unknown,
): Promise<never> {
  const unrestored: string[] = [];
  if (!(await restoreLocaleFile(context, path, snapshot))) {
    unrestored.push(displayPath(context, path));
  }
  if (!(await restoreProvenanceFile(context, provenanceBefore))) {
    unrestored.push(displayPath(context, provenanceFilePath(context.cwd)));
  }
  if (unrestored.length === 0) {
    throw failure;
  }
  throw new SdkError(
    "REVIEW_RESTORE_FAILED",
    `Rejecting "${context.key}" in ${context.locale} failed (${errorMessage(failure)}), and putting the files back failed too, so ${unrestored.join(" and ")} may not match the lock file. Restore them from version control before running verbatra again.`,
    { cause: failure },
  );
}

async function assertLockReadable(context: ReviewContext): Promise<void> {
  await readLockFile(lockFilePath(context.cwd), context.fs);
}

async function rejectUnderGuard(
  context: ReviewContext,
  reviewed: ReviewedValue,
  decision: Decision,
): Promise<ProvenanceRecord> {
  const path = targetPath(context);
  const snapshot = await targetSnapshot(context, path);
  return withLockFileGuard(
    context.cwd,
    context.fs,
    async () => {
      await assertLockReadable(context);
      const plan = await planDecision(context, reviewed.value, decision);
      const provenanceBefore = await context.fs.readFileBounded(
        provenanceFilePath(context.cwd),
        MAX_PROVENANCE_FILE_BYTES,
      );
      try {
        await removeValue(context, reviewed.target, path);
        await updateLockFileLocaleUnguarded(
          context.cwd,
          context.fs,
          context.locale,
          { mode: "remove", keys: [context.key] },
          {
            records: new Map([[context.key, plan.record]]),
            replace: new Set([context.key]),
          },
          { requireProvenance: true },
        );
      } catch (error) {
        return restoreAfterFailedReject(context, path, snapshot, provenanceBefore, error);
      }
      return plan.record;
    },
    context.recordLock,
  );
}

function withLocaleLock<T>(context: ReviewContext, fn: () => Promise<T>): Promise<T> {
  return withLocaleWriteLock(
    context.cwd,
    writeLockKeyFor(context.config.format, context.locale),
    context.fs,
    fn,
    context.writeLock,
  );
}

function reviewerOf(input: ReviewDecisionInput): { reviewer?: string } {
  return input.reviewer !== undefined ? { reviewer: input.reviewer } : {};
}

/**
 * Records that a person reviewed a key's current translation and accepts it. It writes only the
 * provenance file (`verbatra.provenance.json`), never a locale file or the lock-file, and calls no
 * provider.
 *
 * The approval is stored on the value, not on the key: any later write that changes the value or
 * the source it was translated from starts a fresh, unreviewed record. It is also stored with the
 * source hash it was given against, so an approval whose source has since changed reads as
 * unreviewed. Approving a value that is already approved by the same reviewer writes nothing.
 *
 * The call is refused unless the key's current translation is `expectedValue` and is up to date
 * with its source, so an approval always describes the text the reviewer actually saw. A value
 * with no record yet, or one changed outside verbatra, is recorded with the origin `unknown`.
 * Commit the provenance file to share the decision.
 *
 * @param input - The config, locale, key, the value the reviewer saw, and an optional reviewer.
 * @param deps - Optional adapter registry and file-system overrides.
 * @returns The key's provenance after the approval.
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
 * @throws {@link SdkError} `UNKNOWN_KEY`: the key is not present in the source resource.
 * @throws {@link SdkError} `LOCK_CONTENDED`: the locale's write lock or the lock-file guard could
 * not be acquired before the timeout elapsed.
 * @throws {@link SdkError} `REVIEW_VALUE_CHANGED`: the key has no translation, or its translation is
 * not `expectedValue`. Also thrown, before anything is read, when `expectedValue` is not a string.
 * @throws {@link SdkError} `LOCALE_STATE_NOT_CARRIED_OVER`: state recorded under a respelled code
 * of the locale, such as `pt_BR` for `pt-BR`, could not be moved to it first, so nothing was
 * written.
 * @throws {@link SdkError} `REVIEW_SOURCE_CHANGED`: the source text changed since the translation
 * was written, or the lock-file has no entry for the key.
 * @throws {@link SdkError} `LOCK_FILE_INVALID`: the lock-file is corrupt, oversized, or at an
 * unsupported version.
 * @throws {@link SdkError} `PROVENANCE_FILE_INVALID`: the provenance file is corrupt, oversized, or
 * structurally wrong.
 * @throws {@link SdkError} `PROVENANCE_FILE_UNWRITABLE`: the provenance file is from a newer
 * verbatra, or the approval would grow it past the size verbatra reads back. Nothing is written.
 * @throws `AdapterError`: the adapter refused the target locale file because it is malformed. Its
 * own code is preserved rather than remapped onto an {@link SdkErrorCode}.
 */
export async function approveEntry(
  input: ReviewDecisionInput,
  deps: ReviewDecisionDeps = {},
): Promise<ReviewDecisionResult> {
  const context = await reviewContext(input, deps);
  return withLocaleLock(context, async () => {
    const { value } = await reviewedValue(context, input.expectedValue);
    return withLockFileGuard(
      context.cwd,
      context.fs,
      async () => {
        const sourceHash = await lockSourceHash(context);
        if (sourceHash !== contentHash(context.sourceEntry)) {
          throw new SdkError(
            "REVIEW_SOURCE_CHANGED",
            `The source text of "${context.key}" changed since its ${context.locale} translation was written, so the translation cannot be approved as it stands. Edit or retranslate it first.`,
          );
        }
        const plan = await planDecision(context, value, {
          reviewState: "approved",
          reviewedSourceHash: sourceHash,
          ...reviewerOf(input),
        });
        if (plan.kind === "write") {
          await assertLocksHeld();
          await context.fs.writeFile(plan.path, plan.content);
        }
        return {
          locale: context.locale,
          key: context.key,
          provenance: keyProvenance(plan.record, value, sourceHash),
        };
      },
      context.recordLock,
    );
  });
}

/**
 * Records that a person reviewed a key's current translation and refuses it, and removes that
 * translation so it gets replaced. It calls no provider.
 *
 * The key is removed from the target locale file and its lock-file entry is dropped, so the key
 * reads as missing: `check` and `diff` report it, and the next {@link translate} run fills it
 * again. With the provider `none`, it stays missing until someone writes a value for it. The
 * provenance file keeps a `rejected` record carrying a hash of the removed text, and the matching
 * entry of the local translation memory is dropped, so the next run does not put the same text
 * back from the memory on this machine. A new value written for the key replaces the record with a
 * fresh, unreviewed one.
 *
 * A format whose writer keeps a key it was not given cannot express a removed value: XLIFF, where
 * a unit without a target reads as its source text, and Flutter ARB, whose writer keeps every
 * existing message. The call then restores the file and throws rather than report a rejection it
 * could not carry out.
 *
 * The call is refused unless the key's current translation is `expectedValue`. Unlike
 * {@link approveEntry}, it does not require the translation to be up to date with its source. The
 * lock-file and the provenance file are checked, and the decision is planned, under the lock-file
 * guard before the locale file is touched, and the lock-file and provenance file are then written
 * under that same guard. If a step fails after the locale file was rewritten, the locale file
 * and the provenance file are restored on failure and the translation memory is left alone; a
 * process that is killed mid-write cannot be undone this way.
 * Commit the locale file, the lock-file and the provenance file together to share the decision.
 *
 * @param input - The config, locale, key, the value the reviewer saw, and an optional reviewer.
 * @param deps - Optional adapter registry and file-system overrides.
 * @returns The key's provenance after the rejection.
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
 * @throws {@link SdkError} `UNKNOWN_KEY`: the key is not present in the source resource.
 * @throws {@link SdkError} `LOCK_CONTENDED`: the locale's write lock or the lock-file guard could
 * not be acquired before the timeout elapsed.
 * @throws {@link SdkError} `REVIEW_VALUE_CHANGED`: the key has no translation, or its translation is
 * not `expectedValue`. Also thrown, before anything is read, when `expectedValue` is not a string.
 * @throws {@link SdkError} `LOCALE_STATE_NOT_CARRIED_OVER`: state recorded under a respelled code
 * of the locale, such as `pt_BR` for `pt-BR`, could not be moved to it first, so nothing was
 * written.
 * @throws {@link SdkError} `TARGET_UNWRITABLE`: the target locale file could not be written because
 * of a file-system failure.
 * @throws {@link SdkError} `REVIEW_REJECT_UNSUPPORTED`: the configured format keeps the translation
 * when the file is written without it, as XLIFF does, or the locale file is too large to keep a
 * copy to restore. The locale file is left as it was and nothing else is written.
 * @throws {@link SdkError} `REVIEW_RESTORE_FAILED`: a step failed after the locale file or the
 * provenance file changed, and putting a changed file back failed too. The message names the
 * original failure and the files that may no longer match the lock-file; the original error is the
 * `cause`. A failure that changed no file is thrown as is.
 * @throws {@link SdkError} `LOCK_FILE_INVALID`: the lock-file is corrupt, oversized, or at an
 * unsupported version.
 * @throws {@link SdkError} `PROVENANCE_FILE_INVALID`: the provenance file is corrupt, oversized, or
 * structurally wrong.
 * @throws {@link SdkError} `PROVENANCE_FILE_UNWRITABLE`: the provenance file is from a newer
 * verbatra, or the rejection would grow it past the size verbatra reads back. Nothing is written.
 * @throws `AdapterError`: the adapter refused the target locale file, on the read because it is
 * malformed or on the write because the remaining entries cannot be represented in the configured
 * format. Its own code is preserved rather than remapped onto an {@link SdkErrorCode}.
 */
export async function rejectEntry(
  input: ReviewDecisionInput,
  deps: ReviewDecisionDeps = {},
): Promise<ReviewDecisionResult> {
  const context = await reviewContext(input, deps);
  const decision: Decision = { reviewState: "rejected", ...reviewerOf(input) };
  return withLocaleLock(context, async () => {
    const reviewed = await reviewedValue(context, input.expectedValue);
    const record = await rejectUnderGuard(context, reviewed, decision);
    const rejectedHash = valueHash(reviewed.value);
    await evictMemoryValue(
      context.cwd,
      context.fs,
      context.locale,
      contentHash(context.sourceEntry),
      (remembered) => valueHash(remembered) === rejectedHash,
    );
    return {
      locale: context.locale,
      key: context.key,
      provenance: keyProvenance(record, reviewed.value),
    };
  });
}
