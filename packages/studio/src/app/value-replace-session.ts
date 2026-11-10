import { useSyncExternalStore } from "react";

export interface ValueReplaceSession {
  readonly locales: readonly string[];
  readonly opener: HTMLElement | null;
}

let session: ValueReplaceSession | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function openValueReplace(locales: readonly string[], opener: HTMLElement | null): void {
  session = { locales, opener };
  notify();
}

export function closeValueReplace(): void {
  if (session !== null) {
    session = null;
    notify();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useValueReplaceSession(): ValueReplaceSession | null {
  return useSyncExternalStore(subscribe, () => session);
}
