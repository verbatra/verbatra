import { type EntryRef, entryIdentity } from "../shared/rpc/entry-identity.js";

export type InFlightEntryRef = EntryRef;

export interface InFlightEntry extends InFlightEntryRef {
  readonly method: string;
  readonly elapsedMs: number;
}

export interface RpcInFlightGuard {
  tryEnter(method: string, key?: string, entries?: readonly InFlightEntryRef[]): boolean;
  leave(method: string, key?: string): void;
  entries(): readonly InFlightEntry[];
}

interface InFlightCall {
  readonly method: string;
  readonly startedAt: number;
  readonly entries: readonly InFlightEntryRef[];
}

function lockKeyFor(method: string, key: string | undefined): string {
  return key === undefined ? method : `${method}:${key}`;
}

export function createRpcInFlightGuard(
  guardedMethods: ReadonlySet<string>,
  now: () => number = Date.now,
  entryExclusiveMethods: ReadonlySet<string> = new Set(),
): RpcInFlightGuard {
  const inFlight = new Map<string, InFlightCall>();

  function overlapsInFlight(method: string, entries: readonly InFlightEntryRef[]): boolean {
    if (!entryExclusiveMethods.has(method)) {
      return false;
    }
    const wanted = new Set(entries.map(entryIdentity));
    return [...inFlight.values()].some(
      (call) =>
        entryExclusiveMethods.has(call.method) &&
        call.entries.some((entry) => wanted.has(entryIdentity(entry))),
    );
  }

  return {
    tryEnter(method: string, key?: string, entries: readonly InFlightEntryRef[] = []): boolean {
      if (!guardedMethods.has(method)) {
        return true;
      }
      const lockKey = lockKeyFor(method, key);
      if (inFlight.has(lockKey) || overlapsInFlight(method, entries)) {
        return false;
      }
      inFlight.set(lockKey, { method, startedAt: now(), entries });
      return true;
    },
    leave(method: string, key?: string): void {
      inFlight.delete(lockKeyFor(method, key));
    },
    entries(): readonly InFlightEntry[] {
      const at = now();
      return [...inFlight.values()].flatMap((call) =>
        call.entries.map((entry) => ({
          method: call.method,
          locale: entry.locale,
          key: entry.key,
          elapsedMs: Math.max(0, at - call.startedAt),
        })),
      );
    },
  };
}
