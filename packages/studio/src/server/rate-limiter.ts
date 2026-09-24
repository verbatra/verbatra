export interface RateLimitRule {
  readonly windowMs: number;
  readonly maxCalls: number;
  readonly bucket?: string;
  readonly perEntry?: boolean;
}

export interface RpcRateLimiter {
  tryAcquire(method: string, weight?: number): boolean;
  exceedsWindow(method: string, weight?: number): boolean;
  retryAfterMs(method: string, weight?: number): number;
}

function weightOf(rule: RateLimitRule, entries: number): number {
  return rule.perEntry === true ? entries : 1;
}

export function createRpcRateLimiter(
  rules: Readonly<Record<string, RateLimitRule>>,
  now: () => number = Date.now,
): RpcRateLimiter {
  const recentCalls = new Map<string, number[]>();

  function callsWithin(rule: RateLimitRule, method: string, current: number): number[] {
    const windowStart = current - rule.windowMs;
    return (recentCalls.get(rule.bucket ?? method) ?? []).filter(
      (timestamp) => timestamp > windowStart,
    );
  }

  return {
    tryAcquire(method: string, entries = 1): boolean {
      const rule = rules[method];
      if (rule === undefined) {
        return true;
      }
      const weight = weightOf(rule, entries);
      const bucket = rule.bucket ?? method;
      const current = now();
      const withinWindow = callsWithin(rule, method, current);
      if (withinWindow.length + weight > rule.maxCalls) {
        recentCalls.set(bucket, withinWindow);
        return false;
      }
      for (let slot = 0; slot < weight; slot += 1) {
        withinWindow.push(current);
      }
      recentCalls.set(bucket, withinWindow);
      return true;
    },
    exceedsWindow(method: string, entries = 1): boolean {
      const rule = rules[method];
      return rule !== undefined && weightOf(rule, entries) > rule.maxCalls;
    },
    retryAfterMs(method: string, entries = 1): number {
      const rule = rules[method];
      if (rule === undefined) {
        return 0;
      }
      const current = now();
      const withinWindow = callsWithin(rule, method, current);
      const mustExpire = Math.min(
        withinWindow.length,
        withinWindow.length + weightOf(rule, entries) - rule.maxCalls,
      );
      const releasing = withinWindow[mustExpire - 1];
      return releasing === undefined ? 0 : releasing + rule.windowMs - current;
    },
  };
}
