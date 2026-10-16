"use client";

import { useEffect } from "react";

const SCROLL_REGION = "[data-compare-scroll]";

export function revealBesidePinnedColumn(event: FocusEvent): void {
  const target = event.target;
  if (!(target instanceof HTMLElement) || target.matches(SCROLL_REGION)) return;
  if (target.closest(SCROLL_REGION) === null) return;
  target.scrollIntoView({ block: "nearest", inline: "nearest" });
}

export function CompareFocus(): null {
  useEffect(() => {
    document.addEventListener("focusin", revealBesidePinnedColumn);
    return () => document.removeEventListener("focusin", revealBesidePinnedColumn);
  }, []);
  return null;
}
