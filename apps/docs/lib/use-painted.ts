import { useSyncExternalStore } from "react";
import { afterFirstContentfulPaint } from "@/lib/first-paint";

let painted = false;
let waiting = false;
const listeners = new Set<() => void>();

function waitForPaint(): void {
  if (waiting) return;
  waiting = true;
  void afterFirstContentfulPaint().then(() => {
    painted = true;
    for (const notify of listeners) notify();
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  waitForPaint();
  return () => {
    listeners.delete(listener);
  };
}

function usePainted(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => painted,
    () => false,
  );
}

export function useLinkPrefetch<T>(prefetch: T): T | false {
  return usePainted() ? prefetch : false;
}
