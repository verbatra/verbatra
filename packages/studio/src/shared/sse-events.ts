export type RefreshReason = "source" | "targets" | "lock" | "git";

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
