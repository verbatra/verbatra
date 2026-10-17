export type SessionState = { readonly kind: "active" } | { readonly kind: "session-expired" };

export interface SessionStore {
  getState(): SessionState;
  markSessionExpired(): void;
  subscribe(listener: (state: SessionState) => void): () => void;
}

const ACTIVE_STATE: SessionState = { kind: "active" };
const SESSION_EXPIRED_STATE: SessionState = { kind: "session-expired" };

export function createSessionStore(): SessionStore {
  let state: SessionState = ACTIVE_STATE;
  const listeners = new Set<(state: SessionState) => void>();

  function notify(): void {
    for (const listener of listeners) {
      listener(state);
    }
  }

  return {
    getState: () => state,
    markSessionExpired(): void {
      if (state.kind === "session-expired") {
        return;
      }
      state = SESSION_EXPIRED_STATE;
      notify();
    },
    subscribe(listener: (state: SessionState) => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export interface StructuredError {
  readonly code: string;
  readonly message: string;
  readonly retryAfterSeconds?: number;
}

export type FetchOutcome<T> =
  | { readonly ok: true; readonly result: T }
  | { readonly ok: false; readonly error: StructuredError };

export type RefreshableView<T> =
  | { readonly kind: "loading" }
  | { readonly kind: "data"; readonly data: T; readonly stale: false }
  | {
      readonly kind: "data";
      readonly data: T;
      readonly stale: true;
      readonly error: StructuredError;
    }
  | { readonly kind: "error"; readonly error: StructuredError };

export function applyRefreshOutcome<T>(
  previous: RefreshableView<T>,
  outcome: FetchOutcome<T>,
): RefreshableView<T> {
  if (outcome.ok) {
    return { kind: "data", data: outcome.result, stale: false };
  }
  if (previous.kind === "data") {
    return { kind: "data", data: previous.data, stale: true, error: outcome.error };
  }
  return { kind: "error", error: outcome.error };
}
