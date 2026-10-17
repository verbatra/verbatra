import { z } from "zod";

export const DEFAULT_LOCK_TIMEOUT_MS = 30_000;

export const MAX_LOCK_TIMEOUT_MS = 600_000;

export const lockTimeoutMsSchema = z.number().int().min(0).max(MAX_LOCK_TIMEOUT_MS).optional();

export const LOCK_TIMEOUT_DESCRIPTION =
  `The optional lockTimeoutMs parameter, 0 to ${MAX_LOCK_TIMEOUT_MS} milliseconds and ` +
  `${DEFAULT_LOCK_TIMEOUT_MS} by default, bounds how long the call waits for a write lock ` +
  "another process holds before it fails with LOCK_CONTENDED, having written nothing. ";

export function lockAcquireTimeoutMs(lockTimeoutMs: number | undefined): number {
  return lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;
}
