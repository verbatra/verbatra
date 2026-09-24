import { type RefObject, useEffect, useLayoutEffect, useRef } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

export interface DialogA11yOptions {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly shouldRestoreFocus?: () => boolean;
  readonly initialFocus?: RefObject<HTMLElement | null>;
}

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

function trapTabKey(event: KeyboardEvent, container: HTMLElement): void {
  const items = focusableElements(container);
  const first = items[0];
  const last = items[items.length - 1];
  if (first === undefined || last === undefined) {
    return;
  }
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function focusInitial(element: HTMLElement): void {
  element.focus();
  element.scrollIntoView?.({ block: "nearest" });
}

export function useDialogA11y<T extends HTMLElement>({
  isOpen,
  onClose,
  shouldRestoreFocus,
  initialFocus,
}: DialogA11yOptions): RefObject<T | null> {
  const containerRef = useRef<T | null>(null);
  const onCloseRef = useRef(onClose);
  const shouldRestoreFocusRef = useRef(shouldRestoreFocus);
  const initialFocusRef = useRef(initialFocus);
  const initialPending = useRef(false);

  useLayoutEffect(() => {
    onCloseRef.current = onClose;
    shouldRestoreFocusRef.current = shouldRestoreFocus;
    initialFocusRef.current = initialFocus;
  });

  useEffect(() => {
    const target = initialFocusRef.current?.current;
    if (!initialPending.current || target === null || target === undefined) {
      return;
    }
    initialPending.current = false;
    focusInitial(target);
  });

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const container = containerRef.current;
    const initial = initialFocusRef.current?.current;
    if (initial !== null && initial !== undefined) {
      focusInitial(initial);
    } else {
      initialPending.current = initialFocusRef.current !== undefined;
      if (container !== null) {
        focusableElements(container)[0]?.focus();
      }
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key === "Tab" && container !== null) {
        trapTabKey(event, container);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      initialPending.current = false;
      document.removeEventListener("keydown", onKeyDown);
      if (shouldRestoreFocusRef.current?.() !== false) {
        previouslyFocused?.focus();
      }
    };
  }, [isOpen]);

  return containerRef;
}
