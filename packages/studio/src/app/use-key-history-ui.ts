import { useState } from "react";
import { KEY_HISTORY_DEEP_LIMIT, KEY_HISTORY_PAGE_SIZE } from "../client/key-history.js";

export interface KeyHistoryUi {
  readonly confirming: string | null;
  readonly shown: number;
  readonly deep: boolean;
  readonly limit: number | undefined;
  readonly confirm: (commit: string | null) => void;
  readonly showMore: () => void;
  readonly readFurther: () => void;
}

interface Held {
  readonly scope: string;
  readonly confirming: string | null;
  readonly shown: number;
  readonly deep: boolean;
}

export function useKeyHistoryUi(locale: string | undefined, keyName: string): KeyHistoryUi {
  const scope = JSON.stringify([locale, keyName]);
  const [held, setHeld] = useState<Held>({
    scope,
    confirming: null,
    shown: KEY_HISTORY_PAGE_SIZE,
    deep: false,
  });
  let current = held;
  if (held.scope !== scope) {
    current = { scope, confirming: null, shown: KEY_HISTORY_PAGE_SIZE, deep: false };
    setHeld(current);
  }
  return {
    confirming: current.confirming,
    shown: current.shown,
    deep: current.deep,
    limit: current.deep ? KEY_HISTORY_DEEP_LIMIT : undefined,
    confirm: (commit) => setHeld((previous) => ({ ...previous, confirming: commit })),
    showMore: () =>
      setHeld((previous) => ({ ...previous, shown: previous.shown + KEY_HISTORY_PAGE_SIZE })),
    readFurther: () => setHeld((previous) => ({ ...previous, deep: true })),
  };
}
