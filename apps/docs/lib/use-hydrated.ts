import { useSyncExternalStore } from "react";

function subscribeNever(): () => void {
  return () => undefined;
}

export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
}
