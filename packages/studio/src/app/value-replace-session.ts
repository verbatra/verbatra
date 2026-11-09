import { useSyncExternalStore } from "react";

let openLocales: readonly string[] | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function openValueReplace(locales: readonly string[]): void {
  openLocales = locales;
  notify();
}

export function closeValueReplace(): void {
  if (openLocales !== null) {
    openLocales = null;
    notify();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useValueReplaceLocales(): readonly string[] | null {
  return useSyncExternalStore(subscribe, () => openLocales);
}
