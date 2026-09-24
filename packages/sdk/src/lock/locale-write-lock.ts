import { resolve } from "node:path";
import type { FormatId } from "@verbatra/core";
import { errorMessage, SdkError } from "../errors.js";
import type { BoundedFileRead, SdkFs } from "../fs.js";
import { isSharedCatalogueFormat } from "../locale-path/shared-catalogue-format.js";
import {
  currentHostLiveness,
  isHeldByThisProcess,
  isHolderProvablyDead,
  type LivenessContext,
  type RecordedHolder,
} from "./holder-liveness.js";

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
 * as `onLockWait` to {@link translate} and {@link watch}.
 */
export type LockWaitListener = (event: LockWaitEvent) => void;

export interface LocaleWriteLockOptions {
  readonly pollIntervalMs?: number;
  readonly acquireTimeoutMs?: number;
  readonly onWait?: LockWaitListener;
  readonly liveness?: LivenessContext;
}

const DEFAULT_POLL_INTERVAL_MS = 100;
const DEFAULT_ACQUIRE_TIMEOUT_MS = 10 * 60_000;

const WAIT_NOTICE_INTERVAL_MS = 1_000;

const MAX_LOCK_PAYLOAD_BYTES = 64 * 1_024;

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

function sleep(ms: number): Promise<void> {
  return new Promise((res) => {
    setTimeout(res, ms);
  });
}

interface HeldLock {
  readonly path: string;
  readonly fs: SdkFs;
}

const heldLocks = new Set<HeldLock>();

function lockPayload(liveness: LivenessContext): string {
  return JSON.stringify({
    pid: process.pid,
    hostname: liveness.host,
    bootId: liveness.bootId,
    pidNamespace: liveness.pidNamespace,
    acquiredAt: new Date().toISOString(),
  });
}

interface ObservedLock {
  readonly kind: BoundedFileRead["kind"];
  readonly content?: string;
  readonly holder?: LockHolder;
  readonly recorded?: RecordedHolder;
}

interface AbandonedLock {
  readonly content: string;
  readonly recorded: RecordedHolder;
}

async function observeLock(path: string, fs: SdkFs): Promise<ObservedLock> {
  return observedFrom(await fs.readFileBounded(path, MAX_LOCK_PAYLOAD_BYTES));
}

function observedFrom(read: BoundedFileRead): ObservedLock {
  const record = parseRecord(read);
  return {
    kind: read.kind,
    ...(read.kind === "ok" ? { content: read.content } : {}),
    ...(record !== undefined
      ? { holder: holderOf(record), recorded: recordedHolderOf(record) }
      : {}),
  };
}

function isAbandoned(
  observed: ObservedLock,
  liveness: LivenessContext,
): observed is ObservedLock & AbandonedLock {
  return (
    observed.content !== undefined &&
    observed.recorded !== undefined &&
    isHolderProvablyDead(observed.recorded, liveness)
  );
}

async function deleteIfUnchanged(path: string, fs: SdkFs, content: string): Promise<boolean> {
  const again = await fs.readFileBounded(path, MAX_LOCK_PAYLOAD_BYTES);
  if (again.kind !== "ok" || again.content !== content) {
    return false;
  }
  try {
    await fs.deleteFile(path);
  } catch (error) {
    throw new SdkError(
      "LOCK_CONTENDED",
      `Could not reclaim the abandoned write lock at ${path}: ${errorMessage(error)}. Delete it and retry.`,
      { cause: error },
    );
  }
  return true;
}

interface GuardSighting {
  readonly content: string;
  readonly seenAt: number;
}

interface GuardWatch {
  sighting: GuardSighting | undefined;
}

interface ReclaimSettings {
  readonly pollIntervalMs: number;
  readonly liveness: LivenessContext;
}

async function clearAbandonedGuard(
  guard: string,
  fs: SdkFs,
  settings: ReclaimSettings,
  guardWatch: GuardWatch,
): Promise<void> {
  const observed = await observeLock(guard, fs);
  if (!isAbandoned(observed, settings.liveness)) {
    guardWatch.sighting = undefined;
    return;
  }
  const now = Date.now();
  const previous = guardWatch.sighting;
  if (previous === undefined || previous.content !== observed.content) {
    guardWatch.sighting = { content: observed.content, seenAt: now };
    return;
  }
  if (now - previous.seenAt < settings.pollIntervalMs) {
    return;
  }
  guardWatch.sighting = undefined;
  await deleteIfUnchanged(guard, fs, observed.content);
}

async function reclaimAbandonedLock(
  path: string,
  fs: SdkFs,
  observed: ObservedLock,
  settings: ReclaimSettings,
  guardWatch: GuardWatch,
): Promise<boolean> {
  if (!isAbandoned(observed, settings.liveness)) {
    return false;
  }
  const guard = `${path}.reclaim`;
  if (!(await fs.createExclusive(guard, lockPayload(settings.liveness)))) {
    await clearAbandonedGuard(guard, fs, settings, guardWatch);
    return false;
  }
  guardWatch.sighting = undefined;
  try {
    return await deleteIfUnchanged(path, fs, observed.content);
  } finally {
    await fs.deleteFile(guard).catch(() => undefined);
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
}

async function acquireLock(path: string, fs: SdkFs, settings: AcquireSettings): Promise<void> {
  const guardWatch: GuardWatch = { sighting: undefined };
  for (;;) {
    if (await fs.createExclusive(path, lockPayload(settings.liveness))) {
      return;
    }
    const observed = await observeLock(path, fs);
    if (await reclaimAbandonedLock(path, fs, observed, settings, guardWatch)) {
      continue;
    }
    settings.notify?.(observed);
    if (Date.now() >= settings.deadline) {
      throw new SdkError(
        "LOCK_CONTENDED",
        `Could not acquire the write lock at ${path}: another process is holding it. A lock left ` +
          "behind by a process that is no longer running on this machine is reclaimed " +
          "automatically, so this one belongs to a live process, a process on another machine, " +
          "or an older verbatra version. If no verbatra process is running anywhere, delete it " +
          "and retry.",
      );
    }
    await sleep(settings.pollIntervalMs + Math.random() * settings.pollIntervalMs);
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
  const start = Date.now();
  const liveness = options.liveness ?? currentHostLiveness();
  await acquireLock(path, fs, {
    pollIntervalMs,
    deadline: start + acquireTimeoutMs,
    liveness,
    ...(options.onWait !== undefined
      ? { notify: makeWaitNotifier(path, options.onWait, start, liveness) }
      : {}),
  });
  const held: HeldLock = { path, fs };
  heldLocks.add(held);
  try {
    return await fn();
  } finally {
    if (heldLocks.delete(held)) {
      await fs.deleteFile(path);
    }
  }
}

/**
 * Deletes every write lock this process currently holds, for a process that is about to exit
 * without letting its in-flight operations finish, such as a CLI force-stopped by a second
 * interrupt. The operations that took those locks lose their protection, so call it only
 * immediately before the process exits. A lock left behind anyway, by a process killed outright,
 * is reclaimed by the next run on the same machine once the holding process is gone.
 *
 * @returns Resolves once every deletion has been attempted; never rejects.
 */
export async function releaseHeldLocks(): Promise<void> {
  const locks = [...heldLocks];
  heldLocks.clear();
  await Promise.allSettled(locks.map((lock) => lock.fs.deleteFile(lock.path)));
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
  return read.kind === "missing" || isAbandoned(observedFrom(read), liveness) ? "free" : "held";
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
