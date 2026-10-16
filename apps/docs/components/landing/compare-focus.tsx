"use client";

import { useEffect } from "react";

const SCROLL_REGION = "[data-compare-scroll]";

export const COMPARE_FOCUS_ATTACHED = "data-compare-focus";

function revealBesidePinnedColumn(event: FocusEvent): void {
  const target = event.target;
  if (!(target instanceof HTMLElement) || target.matches(SCROLL_REGION)) return;
  if (!target.matches(":focus-visible") || target.closest(SCROLL_REGION) === null) return;
  target.scrollIntoView({ block: "nearest", inline: "nearest" });
}

export function CompareFocus(): null {
  useEffect(() => {
    document.addEventListener("focusin", revealBesidePinnedColumn);
    document.documentElement.setAttribute(COMPARE_FOCUS_ATTACHED, "");
    return () => {
      document.removeEventListener("focusin", revealBesidePinnedColumn);
      document.documentElement.removeAttribute(COMPARE_FOCUS_ATTACHED);
    };
  }, []);
  return null;
}
