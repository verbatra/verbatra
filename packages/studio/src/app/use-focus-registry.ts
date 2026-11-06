import { useCallback, useEffect, useRef, useState } from "react";

export interface FocusRegistry {
  register(key: string): (element: HTMLElement | null) => void;
  request(keys: readonly string[]): void;
}

export function useFocusRegistry(): FocusRegistry {
  const elements = useRef(new Map<string, HTMLElement>());
  const callbacks = useRef(new Map<string, (element: HTMLElement | null) => void>());
  const [wanted, setWanted] = useState<readonly string[] | undefined>(undefined);

  useEffect(() => {
    if (wanted === undefined) {
      return;
    }
    const target = wanted.map((key) => elements.current.get(key)).find((element) => element);
    target?.focus();
    setWanted(undefined);
  }, [wanted]);

  const register = useCallback((key: string) => {
    const existing = callbacks.current.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const callback = (element: HTMLElement | null): void => {
      if (element === null) {
        elements.current.delete(key);
      } else {
        elements.current.set(key, element);
      }
    };
    callbacks.current.set(key, callback);
    return callback;
  }, []);

  const request = useCallback((keys: readonly string[]) => setWanted(keys), []);

  return { register, request };
}
