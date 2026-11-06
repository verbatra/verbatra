import { useEffect } from "react";
import type { Route } from "../client/routes.js";

const MARK_WINDOW_MS = 300;

let markedAt = Number.NEGATIVE_INFINITY;

export function markLinkNavigation(): void {
  markedAt = Date.now();
}

function consumeLinkNavigation(): boolean {
  const fresh = Date.now() - markedAt <= MARK_WINDOW_MS;
  markedAt = Number.NEGATIVE_INFINITY;
  return fresh;
}

function isPlainLinkClick(event: MouseEvent): boolean {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

function handleDocumentClick(event: MouseEvent): void {
  if (!isPlainLinkClick(event) || !(event.target instanceof Element)) {
    return;
  }
  const anchor = event.target.closest("a[href^='#/']");
  if (anchor !== null && !anchor.hasAttribute("target")) {
    markLinkNavigation();
  }
}

export function useScrollToTopOnLinkNavigation(route: Route): void {
  useEffect(() => {
    document.addEventListener("click", handleDocumentClick);
    return () => document.removeEventListener("click", handleDocumentClick);
  }, []);

  useEffect(() => {
    if (route !== undefined && consumeLinkNavigation()) {
      window.scrollTo(0, 0);
    }
  }, [route]);
}
