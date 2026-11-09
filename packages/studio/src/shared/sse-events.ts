export const REFRESH_REASONS = ["source", "targets", "lock", "git", "run-history"] as const;

export type RefreshReason = (typeof REFRESH_REASONS)[number];

export function isRefreshReason(value: unknown): value is RefreshReason {
  return REFRESH_REASONS.some((reason) => reason === value);
}

export interface RefreshKeyDelta {
  readonly added: number;
  readonly changed: number;
  readonly removed: number;
}

export interface RefreshEvent {
  readonly reason: RefreshReason;
  readonly at: string;
  readonly locale?: string;
  readonly delta?: RefreshKeyDelta;
}

export interface ShutdownEvent {
  readonly at: string;
}

export const SSE_EVENT_REFRESH = "refresh";

export const SSE_EVENT_SHUTDOWN = "shutdown";
