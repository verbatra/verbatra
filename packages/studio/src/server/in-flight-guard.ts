export interface RpcInFlightGuard {
  tryEnter(method: string, key?: string): boolean;
  leave(method: string, key?: string): void;
}

function lockKeyFor(method: string, key: string | undefined): string {
  return key === undefined ? method : `${method}:${key}`;
}

export function createRpcInFlightGuard(guardedMethods: ReadonlySet<string>): RpcInFlightGuard {
  const inFlight = new Set<string>();

  return {
    tryEnter(method: string, key?: string): boolean {
      if (!guardedMethods.has(method)) {
        return true;
      }
      const lockKey = lockKeyFor(method, key);
      if (inFlight.has(lockKey)) {
        return false;
      }
      inFlight.add(lockKey);
      return true;
    },
    leave(method: string, key?: string): void {
      inFlight.delete(lockKeyFor(method, key));
    },
  };
}
