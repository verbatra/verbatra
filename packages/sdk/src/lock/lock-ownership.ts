import { AsyncLocalStorage } from "node:async_hooks";
import { SdkError } from "../errors.js";
import type { BoundedFileRead, SdkFs } from "../fs.js";
import type { LivenessContext } from "./holder-liveness.js";
import {
  hasRename,
  isTransientFsError,
  MAX_LOCK_PAYLOAD_BYTES,
  moveAsideIfUnchanged,
} from "./lock-aside.js";

export interface OwnedLock {
  readonly path: string;
  readonly fs: SdkFs;
  readonly content: string;
}

const ownership = new AsyncLocalStorage<readonly OwnedLock[]>();

export function runOwning<T>(owned: OwnedLock, fn: () => Promise<T>): Promise<T> {
  return ownership.run([...(ownership.getStore() ?? []), owned], fn);
}

function takenOverError(path: string, cause?: unknown): SdkError {
  return new SdkError(
    "LOCK_CONTENDED",
    `The write lock at ${path} was taken over by another process, so this operation stopped ` +
      "without writing. Run it again.",
    cause !== undefined ? { cause } : undefined,
  );
}

export function takenOverAtReleaseError(path: string): SdkError {
  return new SdkError(
    "LOCK_CONTENDED",
    `The write lock at ${path} was taken over or removed by another process before this ` +
      "operation released it. Every write it made was checked against the lock first, but the " +
      "other process may have changed the same files since. Run it again to confirm the result.",
  );
}

async function assertHeld(owned: OwnedLock): Promise<void> {
  let read: BoundedFileRead;
  try {
    read = await owned.fs.readFileBounded(owned.path, MAX_LOCK_PAYLOAD_BYTES);
  } catch (error) {
    throw takenOverError(owned.path, error);
  }
  if (read.kind !== "ok" || read.content !== owned.content) {
    throw takenOverError(owned.path);
  }
}

export async function assertLocksHeld(): Promise<void> {
  for (const owned of ownership.getStore() ?? []) {
    await assertHeld(owned);
  }
}

async function beat(owned: OwnedLock): Promise<void> {
  try {
    const read = await owned.fs.readFileBounded(owned.path, MAX_LOCK_PAYLOAD_BYTES);
    if (read.kind === "ok" && read.content === owned.content) {
      await owned.fs.touch?.(owned.path);
    }
  } catch {
    return;
  }
}

export function startHeartbeat(owned: OwnedLock, intervalMs: number): () => void {
  if (owned.fs.touch === undefined) {
    return () => undefined;
  }
  const timer = setInterval(() => {
    void beat(owned);
  }, intervalMs);
  timer.unref();
  return () => {
    clearInterval(timer);
  };
}

export type ReleaseOutcome = "released" | "foreign" | "missing";

async function ownershipOf(owned: OwnedLock): Promise<ReleaseOutcome | "own"> {
  const read = await owned.fs.readFileBounded(owned.path, MAX_LOCK_PAYLOAD_BYTES);
  if (read.kind === "missing") {
    return "missing";
  }
  return read.kind === "ok" && read.content === owned.content ? "own" : "foreign";
}

async function deleteIfOwn(owned: OwnedLock): Promise<ReleaseOutcome> {
  const state = await ownershipOf(owned);
  if (state !== "own") {
    return state;
  }
  await owned.fs.deleteFile(owned.path);
  return "released";
}

async function moveAsideIfOwn(
  owned: OwnedLock,
  liveness: LivenessContext,
): Promise<ReleaseOutcome | undefined> {
  if (!hasRename(owned.fs)) {
    return undefined;
  }
  const moved = await moveAsideIfUnchanged(owned.path, owned.fs, owned.content, liveness).catch(
    (error: unknown) => ({ kind: "busy", error }) as const,
  );
  switch (moved.kind) {
    case "busy":
      return undefined;
    case "removed":
      return "released";
    case "missing":
      return "missing";
    default:
      return "foreign";
  }
}

async function releaseOnce(owned: OwnedLock, liveness: LivenessContext): Promise<ReleaseOutcome> {
  const state = await ownershipOf(owned);
  if (state !== "own") {
    return state;
  }
  return (await moveAsideIfOwn(owned, liveness)) ?? deleteIfOwn(owned);
}

const RELEASE_ATTEMPTS = 5;

function pause(ms: number): Promise<void> {
  return new Promise((res) => {
    setTimeout(res, ms);
  });
}

export async function releaseOwned(
  owned: OwnedLock,
  liveness: LivenessContext,
  retryDelayMs: number,
): Promise<ReleaseOutcome> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await releaseOnce(owned, liveness);
    } catch (error) {
      if (attempt >= RELEASE_ATTEMPTS || !isTransientFsError(error)) {
        throw error;
      }
    }
    await pause(retryDelayMs);
  }
}
