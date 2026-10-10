import { type RefObject, useEffect } from "react";

export interface DrawerState {
  open: boolean;
  mode: "drawer" | "full";
  setOpen: (open: boolean) => void;
}

function isInsideDialog(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('[role="dialog"]') !== null;
}

export function shouldCloseDrawer(event: KeyboardEvent): boolean {
  if (event.key !== "Escape" || event.defaultPrevented || event.isComposing) return false;
  return !isInsideDialog(event.target);
}

export function useDrawerEscape(
  { open, mode, setOpen }: DrawerState,
  triggerRef: RefObject<HTMLButtonElement | null>,
): void {
  useEffect(() => {
    if (!open || mode !== "drawer") return;
    function onKeyDown(event: KeyboardEvent): void {
      if (!shouldCloseDrawer(event)) return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, mode, setOpen, triggerRef]);
}
