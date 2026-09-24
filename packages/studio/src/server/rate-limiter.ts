export interface RateLimitRule {
  readonly windowMs: number;
  readonly maxCalls: number;
  readonly bucket?: string;
  readonly perEntry?: boolean;
}

export interface RpcRateLimiter {
  tryAcquire(method: string, weight?: number): boolean;
  exceedsWindow(method: string, weight?: number): boolean;
}

function weightOf(rule: RateLimitRule, entries: number): number {
  return rule.perEntry === true ? entries : 1;
}

export function createRpcRateLimiter(
  rules: Readonly<Record<string, RateLimitRule>>,
  now: () => number = Date.now,
): RpcRateLimiter {
  const recentCalls = new Map<string, number[]>();

  return {
    tryAcquire(method: string, entries = 1): boolean {
      const rule = rules[method];
      if (rule === undefined) {
        return true;
      }
      const weight = weightOf(rule, entries);
      const bucket = rule.bucket ?? method;
      const current = now();
      const windowStart = current - rule.windowMs;
      const withinWindow = (recentCalls.get(bucket) ?? []).filter(
        (timestamp) => timestamp > windowStart,
      );
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
  };
}
