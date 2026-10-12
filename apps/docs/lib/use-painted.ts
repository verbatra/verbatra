import { useSyncExternalStore } from "react";
import { afterFirstContentfulPaint } from "@/lib/island";

let painted = false;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!painted) {
    void afterFirstContentfulPaint().then(() => {
      painted = true;
      for (const notify of listeners) notify();
    });
  }
  return () => {
    listeners.delete(listener);
  };
}

export function usePainted(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => painted,
    () => false,
  );
}

export function useLinkPrefetch<T>(prefetch: T): T | false {
  return usePainted() ? prefetch : false;
}
