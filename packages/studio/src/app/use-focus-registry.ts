import { useCallback, useEffect, useRef, useState } from "react";

const HEADER_GAP = 12;
const LANDING_WINDOW_MS = 600;

export type RevealAlign = "nearest" | "top";

export interface FocusRequestOptions {
  readonly align?: RevealAlign;
}

function reveal(element: HTMLElement, align: RevealAlign): void {
  const header = document.querySelector("header");
  const covered = header === null ? 0 : header.getBoundingClientRect().bottom;
  const { top, bottom } = element.getBoundingClientRect();
  if (align === "top" || top < covered + HEADER_GAP) {
    window.scrollBy?.(0, top - covered - HEADER_GAP);
  } else if (bottom > window.innerHeight) {
    window.scrollBy?.(0, bottom - window.innerHeight + HEADER_GAP);
  }
}

function revealAfterLanding(element: HTMLElement, align: RevealAlign): void {
  const again = (): void => {
    if (document.activeElement === element) {
      reveal(element, align);
    }
  };
  const onLanding = (): void => {
    requestAnimationFrame(() => requestAnimationFrame(again));
  };
  window.addEventListener("popstate", onLanding);
  window.addEventListener("hashchange", onLanding);
  window.setTimeout(() => {
    window.removeEventListener("popstate", onLanding);
    window.removeEventListener("hashchange", onLanding);
  }, LANDING_WINDOW_MS);
}

export function focusIsFree(within: Element | null): boolean {
  const active = document.activeElement;
  if (active === null || active === document.body) {
    return true;
  }
  return (within?.contains(active) ?? false) || active.closest("[role=dialog]") !== null;
}

export interface FocusRegistry {
  register(key: string): (element: HTMLElement | null) => void;
  request(keys: readonly string[], options?: FocusRequestOptions): void;
}

interface Wanted {
  readonly keys: readonly string[];
  readonly align: RevealAlign;
}

export function useFocusRegistry(): FocusRegistry {
  const elements = useRef(new Map<string, HTMLElement>());
  const callbacks = useRef(new Map<string, (element: HTMLElement | null) => void>());
  const [wanted, setWanted] = useState<Wanted | undefined>(undefined);

  useEffect(() => {
    if (wanted === undefined) {
      return;
    }
    const target = wanted.keys.map((key) => elements.current.get(key)).find((element) => element);
    if (target !== undefined) {
      target.focus({ preventScroll: true });
      reveal(target, wanted.align);
      revealAfterLanding(target, wanted.align);
    }
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

  const request = useCallback(
    (keys: readonly string[], options?: FocusRequestOptions) =>
      setWanted({ keys, align: options?.align ?? "nearest" }),
    [],
  );

  return { register, request };
}
