import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import type { FormatId } from "@verbatra/core";
import { cancelledError, isCancelled, signalField } from "../cancellation.js";
import { errorMessage, SdkError } from "../errors.js";
import type { BoundedFileRead, SdkFs } from "../fs.js";
import { isSharedCatalogueFormat } from "../locale-path/shared-catalogue-format.js";
import {
  currentHostLiveness,
  isHeldByThisProcess,
  isHolderProvablyDead,
  type LivenessContext,
  type RecordedHolder,
  sharesProcessTable,
} from "./holder-liveness.js";
import {
  hasRename,
  isOlderThan,
  MAX_LOCK_PAYLOAD_BYTES,
  type MoveAsideResult,
  moveAsideIfUnchanged,
  sweepAbandonedAsides,
} from "./lock-aside.js";
import {
  type OwnedLock,
  releaseOwned,
  runOwning,
  startHeartbeat,
  takenOverAtReleaseError,
} from "./lock-ownership.js";

export { assertLocksHeld } from "./lock-ownership.js";

const LOCAL_DIR_NAME = ".verbatra-local";

const LOCK_FILE_GUARD_STEM = "_lockfile";

const GLOSSARY_GUARD_STEM = "_glossary";

const SHARED_CATALOGUE_STEM = "_catalogue";

/**
 * Whatever could be read about the process currently holding a write lock. Every field is optional
 * because a lock file left behind by a killed process may be truncated or unreadable, or written by
 * an older version, and reporting a partial holder is more useful than reporting none.
 */
export interface LockHolder {
  /** The process ID recorded when the lock was taken. */
  readonly pid?: number;
  /** The host name of the machine the holding process runs on. */
  readonly hostname?: string;
  /** When the lock was taken, as an ISO 8601 timestamp. */
  readonly acquiredAt?: string;
}

/**
 * Reported while a run waits for another process to release a locale's write lock. It exists so a
 * CLI or UI can explain a stall rather than appearing to hang, and can name the lock file a user
 * may need to delete after a crash.
 */
export interface LockWaitEvent {
  /** Absolute path of the lock file being waited on. */
  readonly lockPath: string;
  /** How long this acquisition has been waiting, in milliseconds. */
  readonly elapsedMs: number;
  /** What is known about the holding process, when anything could be read. */
  readonly holder?: LockHolder;
}

/**
 * Called while waiting for a write lock another process holds: first once the wait has lasted a
 * second, then at most once a second. Never called for a lock this process holds itself. Passed
 * as `onLockWait` to any call that takes it.
 */
export type LockWaitListener = (event: LockWaitEvent) => void;

export interface LocaleWriteLockOptions {
  readonly pollIntervalMs?: number;
  readonly acquireTimeoutMs?: number;
  readonly onWait?: LockWaitListener;
  readonly liveness?: LivenessContext;
  readonly heartbeatIntervalMs?: number;
  readonly signal?: AbortSignal;
}

export interface RunLockInput {
  readonly onLockWait?: LockWaitListener;
  readonly lockAcquireTimeoutMs?: number;
  readonly signal?: AbortSignal;
}

export function assertLockAcquireTimeout(value: number | undefined): void {
  if (value !== undefined && !(Number.isSafeInteger(value) && value >= 0)) {
    throw new SdkError(
      "LOCK_TIMEOUT_INVALID",
      `The lockAcquireTimeoutMs option must be a whole number of milliseconds of at least 0, got ${value}.`,
    );
  }
}

export function writeLockOptions(input: RunLockInput): LocaleWriteLockOptions {
  return {
    ...(input.onLockWait !== undefined ? { onWait: input.onLockWait } : {}),
    ...(input.lockAcquireTimeoutMs !== undefined
      ? { acquireTimeoutMs: input.lockAcquireTimeoutMs }
      : {}),
    ...signalField(input.signal),
  };
}

export function recordLockOptions(input: RunLockInput): LocaleWriteLockOptions {
  return input.onLockWait !== undefined ? { onWait: input.onLockWait } : {};
}

const DEFAULT_POLL_INTERVAL_MS = 100;
const DEFAULT_ACQUIRE_TIMEOUT_MS = 10 * 60_000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 10_000;
const STALE_HEARTBEATS = 3;

const WAIT_NOTICE_INTERVAL_MS = 1_000;

function lockPath(cwd: string, stem: string): string {
  return resolve(cwd, LOCAL_DIR_NAME, "locks", `${stem}.lock`);
}

export function localeLockPath(cwd: string, locale: string): string {
  return lockPath(cwd, locale);
}

export function writeLockKeyFor(format: FormatId, locale: string): string {
  return isSharedCatalogueFormat(format) ? SHARED_CATALOGUE_STEM : locale;
}

export function lockFileGuardPath(cwd: string): string {
  return lockPath(cwd, LOCK_FILE_GUARD_STEM);
}

export function glossaryGuardPath(cwd: string): string {
  return lockPath(cwd, GLOSSARY_GUARD_STEM);
}

function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((res) => {
    const wake = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", wake);
      res();
    };
    const timer = setTimeout(wake, ms);
    signal?.addEventListener("abort", wake, { once: true });
  });
}

const heldLocks = new Set<OwnedLock>();

interface PayloadSettings {
  readonly liveness: LivenessContext;
  readonly heartbeatIntervalMs: number;
}

function payload(liveness: LivenessContext, heartbeatMs: number | undefined): string {
  return JSON.stringify({
    pid: process.pid,
    hostname: liveness.host,
    bootId: liveness.bootId,
    pidNamespace: liveness.pidNamespace,
    acquiredAt: new Date().toISOString(),
    nonce: randomUUID(),
    ...(heartbeatMs !== undefined ? { heartbeatMs } : {}),
  });
}

function lockPayload(fs: SdkFs, settings: PayloadSettings): string {
  return payload(
    settings.liveness,
    fs.touch !== undefined ? settings.heartbeatIntervalMs : undefined,
  );
}

function guardPayload(settings: PayloadSettings): string {
  return payload(settings.liveness, undefined);
}

interface ObservedLock {
  readonly kind: BoundedFileRead["kind"];
  readonly content?: string;
  readonly holder?: LockHolder;
  readonly recorded?: RecordedHolder;
  readonly heartbeatMs?: number;
}

const unreadableLockErrors = new WeakSet<SdkError>();

const unacquiredLockPaths = new WeakMap<SdkError, string>();

export function isUnreadableLockError(error: unknown): boolean {
  return error instanceof SdkError && unreadableLockErrors.has(error);
}

export function unacquiredLockPath(error: unknown): string | undefined {
  return error instanceof SdkError ? unacquiredLockPaths.get(error) : undefined;
}

function markUnacquired(path: string, error: SdkError): SdkError {
  unacquiredLockPaths.set(error, path);
  return error;
}

function tooLargeLockError(path: string): SdkError {
  const error = new SdkError(
    "LOCK_CONTENDED",
    `The lock file at ${path} is too large to be a lock and cannot be read. If no verbatra ` +
      "process is running anywhere, delete it and retry.",
  );
  unreadableLockErrors.add(error);
  return error;
}

async function observeLock(path: string, fs: SdkFs): Promise<ObservedLock> {
  const read = await fs.readFileBounded(path, MAX_LOCK_PAYLOAD_BYTES);
  if (read.kind === "too-large") {
    throw tooLargeLockError(path);
  }
  return observedFrom(read);
}

function observedFrom(read: BoundedFileRead): ObservedLock {
  const record = parseRecord(read);
  const heartbeatMs = record !== undefined ? heartbeatOf(record) : undefined;
  return {
    kind: read.kind,
    ...(read.kind === "ok" ? { content: read.content } : {}),
    ...(record !== undefined
      ? { holder: holderOf(record), recorded: recordedHolderOf(record) }
      : {}),
    ...(heartbeatMs !== undefined ? { heartbeatMs } : {}),
  };
}

type Abandonment =
  | { readonly kind: "held" }
  | { readonly kind: "dead" | "stale"; readonly content: string };

async function isHeartbeatStale(
  path: string,
  fs: SdkFs,
  observed: ObservedLock,
  liveness: LivenessContext,
): Promise<boolean> {
  if (
    observed.heartbeatMs === undefined ||
    observed.recorded === undefined ||
    !sharesProcessTable(observed.recorded, liveness)
  ) {
    return false;
  }
  return isOlderThan(path, fs, STALE_HEARTBEATS * observed.heartbeatMs);
}

async function abandonmentOf(
  path: string,
  fs: SdkFs,
  observed: ObservedLock,
  liveness: LivenessContext,
): Promise<Abandonment> {
  const content = observed.content;
  if (content === undefined || observed.recorded === undefined) {
    return { kind: "held" };
  }
  if (isHolderProvablyDead(observed.recorded, liveness)) {
    return { kind: "dead", content };
  }
  return (await isHeartbeatStale(path, fs, observed, liveness))
    ? { kind: "stale", content }
    : { kind: "held" };
}

function reclaimError(path: string, error: unknown): SdkError {
  return new SdkError(
    "LOCK_CONTENDED",
    `Could not reclaim the abandoned write lock at ${path}: ${errorMessage(error)}. Delete it and retry.`,
    { cause: error },
  );
}

async function deleteIfUnchanged(
  path: string,
  fs: SdkFs,
  content: string,
  liveness: LivenessContext,
): Promise<MoveAsideResult> {
  const again = await fs.readFileBounded(path, MAX_LOCK_PAYLOAD_BYTES);
  if (again.kind !== "ok" || again.content !== content) {
    return { kind: "changed" };
  }
  try {
    if (hasRename(fs)) {
      return await moveAsideIfUnchanged(path, fs, content, liveness);
    }
    await fs.deleteFile(path);
  } catch (error) {
    throw reclaimError(path, error);
  }
  return { kind: "removed" };
}

interface GuardSighting {
  readonly content: string;
  readonly seenAt: number;
}

interface RenameRefusal {
  readonly path: string;
  readonly error: unknown;
}

interface AcquireState {
  sighting: GuardSighting | undefined;
  refusal: RenameRefusal | undefined;
}

interface ReclaimSettings extends PayloadSettings {
  readonly pollIntervalMs: number;
}

function noteRefusal(state: AcquireState, path: string, result: MoveAsideResult): boolean {
  if (result.kind === "busy") {
    state.refusal = { path, error: result.error };
  }
  return result.kind === "removed";
}

function isSecondSighting(state: AcquireState, content: string, pollIntervalMs: number): boolean {
  const now = Date.now();
  const previous = state.sighting;
  if (previous === undefined || previous.content !== content) {
    state.sighting = { content, seenAt: now };
    return false;
  }
  return now - previous.seenAt >= pollIntervalMs;
}

async function clearAbandonedGuard(
  guard: string,
  fs: SdkFs,
  settings: ReclaimSettings,
  state: AcquireState,
): Promise<void> {
  const { heartbeatMs: _unbeaten, ...observed } = await observeLock(guard, fs);
  const abandonment = await abandonmentOf(guard, fs, observed, settings.liveness);
  if (abandonment.kind === "held") {
    state.sighting = undefined;
    return;
  }
  if (
    abandonment.kind === "dead" &&
    !isSecondSighting(state, abandonment.content, settings.pollIntervalMs)
  ) {
    return;
  }
  state.sighting = undefined;
  const result = await deleteIfUnchanged(guard, fs, abandonment.content, settings.liveness);
  noteRefusal(state, guard, result);
}

async function releaseGuard(guard: string, fs: SdkFs, content: string, settings: ReclaimSettings) {
  await releaseOwned(
    { path: guard, fs, content },
    settings.liveness,
    settings.pollIntervalMs,
  ).catch(() => undefined);
}

async function reclaimAbandonedLock(
  path: string,
  fs: SdkFs,
  observed: ObservedLock,
  settings: ReclaimSettings,
  state: AcquireState,
): Promise<boolean> {
  const abandonment = await abandonmentOf(path, fs, observed, settings.liveness);
  if (abandonment.kind === "held") {
    return false;
  }
  const guard = `${path}.reclaim`;
  const guardContent = guardPayload(settings);
  if (!(await fs.createExclusive(guard, guardContent))) {
    await clearAbandonedGuard(guard, fs, settings, state);
    return false;
  }
  state.sighting = undefined;
  try {
    const result = await deleteIfUnchanged(path, fs, abandonment.content, settings.liveness);
    return noteRefusal(state, path, result);
  } finally {
    await releaseGuard(guard, fs, guardContent, settings);
  }
}

function parseRecord(read: BoundedFileRead): Readonly<Record<string, unknown>> | undefined {
  if (read.kind !== "ok") {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(read.content);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return undefined;
  }
  return parsed as Readonly<Record<string, unknown>>;
}

function stringField(record: Readonly<Record<string, unknown>>, name: string): string | undefined {
  const value = record[name];
  return typeof value === "string" ? value : undefined;
}

function holderOf(record: Readonly<Record<string, unknown>>): LockHolder {
  const hostname = stringField(record, "hostname");
  const acquiredAt = stringField(record, "acquiredAt");
  return {
    ...(typeof record.pid === "number" ? { pid: record.pid } : {}),
    ...(hostname !== undefined ? { hostname } : {}),
    ...(acquiredAt !== undefined ? { acquiredAt } : {}),
  };
}

function heartbeatOf(record: Readonly<Record<string, unknown>>): number | undefined {
  const value = record.heartbeatMs;
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function recordedHolderOf(record: Readonly<Record<string, unknown>>): RecordedHolder {
  const bootId = stringField(record, "bootId");
  const pidNamespace = stringField(record, "pidNamespace");
  return {
    ...holderOf(record),
    ...(bootId !== undefined ? { bootId } : {}),
    ...(pidNamespace !== undefined ? { pidNamespace } : {}),
  };
}

function unidentifiedStateOf(observed: ObservedLock): string | undefined {
  if (observed.holder !== undefined) {
    return undefined;
  }
  return observed.content !== undefined ? `ok:${observed.content}` : observed.kind;
}

function makeWaitNotifier(
  path: string,
  onWait: LockWaitListener,
  start: number,
  liveness: LivenessContext,
): (observed: ObservedLock) => void {
  let lastEmit = 0;
  let previousUnidentified: string | undefined;
  const isConfirmedHeld = (observed: ObservedLock): boolean => {
    const unidentified = unidentifiedStateOf(observed);
    const confirmed = unidentified === undefined || unidentified === previousUnidentified;
    previousUnidentified = unidentified;
    return confirmed;
  };
  return (observed: ObservedLock): void => {
    if (observed.kind === "missing") {
      previousUnidentified = undefined;
      return;
    }
    if (observed.recorded !== undefined && isHeldByThisProcess(observed.recorded, liveness)) {
      return;
    }
    if (!isConfirmedHeld(observed)) {
      return;
    }
    const elapsedMs = Date.now() - start;
    if (elapsedMs - lastEmit < WAIT_NOTICE_INTERVAL_MS) {
      return;
    }
    lastEmit = elapsedMs;
    const holder = observed.holder;
    onWait({ lockPath: path, elapsedMs, ...(holder !== undefined ? { holder } : {}) });
  };
}

interface AcquireSettings extends ReclaimSettings {
  readonly deadline: number;
  readonly notify?: (observed: ObservedLock) => void;
  readonly signal?: AbortSignal;
}

function lockWaitCancelledError(path: string): SdkError {
  return cancelledError(
    `The operation was cancelled while waiting for the write lock at ${path}, so nothing was ` +
      "sent or written under it.",
  );
}

function contendedError(path: string, refusal: RenameRefusal | undefined): SdkError {
  const message =
    `Could not acquire the write lock at ${path}: another process is holding it. A lock left ` +
    "behind by a process that is no longer running on this machine is reclaimed " +
    "automatically, so this one belongs to a live process, a process on another machine, " +
    "or an older verbatra version. If no verbatra process is running anywhere, delete it " +
    "and retry.";
  if (refusal === undefined) {
    return new SdkError("LOCK_CONTENDED", message);
  }
  return new SdkError(
    "LOCK_CONTENDED",
    `${message} Moving the abandoned file ${refusal.path} aside last failed: ` +
      `${errorMessage(refusal.error)}.`,
    { cause: refusal.error },
  );
}

async function acquireLock(path: string, fs: SdkFs, settings: AcquireSettings): Promise<string> {
  await sweepAbandonedAsides(dirname(path), fs, {
    liveness: settings.liveness,
    staleAfterMs: STALE_HEARTBEATS * settings.heartbeatIntervalMs,
  });
  const state: AcquireState = { sighting: undefined, refusal: undefined };
  for (;;) {
    const content = lockPayload(fs, settings);
    if (await fs.createExclusive(path, content)) {
      await fs.touch?.(path).catch(() => undefined);
      return content;
    }
    const observed = await observeLock(path, fs);
    if (await reclaimAbandonedLock(path, fs, observed, settings, state)) {
      continue;
    }
    settings.notify?.(observed);
    if (isCancelled(settings.signal)) {
      throw lockWaitCancelledError(path);
    }
    if (Date.now() >= settings.deadline) {
      throw markUnacquired(path, contendedError(path, state.refusal));
    }
    await sleep(settings.pollIntervalMs + Math.random() * settings.pollIntervalMs, settings.signal);
  }
}

type Settled<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: unknown };

async function settle<T>(run: () => Promise<T>): Promise<Settled<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    return { ok: false, error };
  }
}

async function withFileLock<T>(
  path: string,
  fs: SdkFs,
  fn: () => Promise<T>,
  options: LocaleWriteLockOptions,
): Promise<T> {
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const acquireTimeoutMs = options.acquireTimeoutMs ?? DEFAULT_ACQUIRE_TIMEOUT_MS;
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
  const start = Date.now();
  const liveness = options.liveness ?? currentHostLiveness();
  const content = await acquireLock(path, fs, {
    pollIntervalMs,
    heartbeatIntervalMs,
    deadline: start + acquireTimeoutMs,
    liveness,
    ...(options.onWait !== undefined
      ? { notify: makeWaitNotifier(path, options.onWait, start, liveness) }
      : {}),
    ...signalField(options.signal),
  });
  const owned: OwnedLock = { path, fs, content };
  heldLocks.add(owned);
  const stopHeartbeat = startHeartbeat(owned, heartbeatIntervalMs);
  const outcome = await settle(() => runOwning(owned, fn));
  stopHeartbeat();
  const released = heldLocks.delete(owned)
    ? await releaseOwned(owned, liveness, pollIntervalMs)
    : "released";
  if (!outcome.ok) {
    throw outcome.error;
  }
  if (released !== "released") {
    throw takenOverAtReleaseError(path);
  }
  return outcome.value;
}

/**
 * Deletes every write lock this process currently holds, for a process that is about to exit
 * without letting its in-flight operations finish, such as a CLI force-stopped by a second
 * interrupt. A lock is deleted only while it still holds this process's own ownership token, so a
 * lock another process has taken over is left alone, and an operation still running after this
 * call finds its lock gone and writes nothing more. Call it only immediately before the process
 * exits. A lock left behind anyway, by a process killed outright, is reclaimed by the next run on
 * the same machine once the holding process is gone.
 *
 * @returns Resolves once every deletion has been attempted; never rejects.
 */
export async function releaseHeldLocks(): Promise<void> {
  const locks = [...heldLocks];
  heldLocks.clear();
  const liveness = currentHostLiveness();
  await Promise.allSettled(
    locks.map((owned) => releaseOwned(owned, liveness, DEFAULT_POLL_INTERVAL_MS)),
  );
}

export type LockProbe = "free" | "held" | "unreadable";

export async function probeLock(
  path: string,
  fs: SdkFs,
  liveness: LivenessContext = currentHostLiveness(),
): Promise<LockProbe> {
  let read: BoundedFileRead;
  try {
    read = await fs.readFileBounded(path, MAX_LOCK_PAYLOAD_BYTES);
  } catch {
    return "unreadable";
  }
  if (read.kind === "too-large") {
    return "unreadable";
  }
  if (read.kind === "missing") {
    return "free";
  }
  const abandonment = await abandonmentOf(path, fs, observedFrom(read), liveness);
  return abandonment.kind === "held" ? "held" : "free";
}

export async function withLocaleWriteLock<T>(
  cwd: string,
  locale: string,
  fs: SdkFs,
  fn: () => Promise<T>,
  options: LocaleWriteLockOptions = {},
): Promise<T> {
  return withFileLock(localeLockPath(cwd, locale), fs, fn, options);
}

export async function withLockFileGuard<T>(
  cwd: string,
  fs: SdkFs,
  fn: () => Promise<T>,
  options: LocaleWriteLockOptions = {},
): Promise<T> {
  return withFileLock(lockFileGuardPath(cwd), fs, fn, options);
}

export async function withGlossaryGuard<T>(
  cwd: string,
  fs: SdkFs,
  fn: () => Promise<T>,
  options: LocaleWriteLockOptions = {},
): Promise<T> {
  return withFileLock(glossaryGuardPath(cwd), fs, fn, options);
}
