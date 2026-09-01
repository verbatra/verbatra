export interface McpInFlightGuard {
  tryEnter(name: string, key?: string): boolean;
  leave(name: string, key?: string): void;
}

function lockKeyFor(name: string, key: string | undefined): string {
  return key === undefined ? name : `${name}:${key}`;
}

export function createMcpInFlightGuard(guardedTools: ReadonlySet<string>): McpInFlightGuard {
  const inFlight = new Set<string>();

  return {
    tryEnter(name: string, key?: string): boolean {
      if (!guardedTools.has(name)) {
        return true;
      }
      const lockKey = lockKeyFor(name, key);
      if (inFlight.has(lockKey)) {
        return false;
      }
      inFlight.add(lockKey);
      return true;
    },
    leave(name: string, key?: string): void {
      inFlight.delete(lockKeyFor(name, key));
    },
  };
}
