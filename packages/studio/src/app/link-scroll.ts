import { useEffect, useLayoutEffect } from "react";
import { parseRoute, type Route, routeHash } from "../client/routes.js";
import { onHoldDropped } from "./route-guard.js";

let pendingTarget: string | null = null;

function sameRoute(left: string, right: string): boolean {
  return routeHash(parseRoute(left)) === routeHash(parseRoute(right));
}

export function markLinkNavigation(target: string): void {
  pendingTarget = target;
}

function clearLinkNavigation(): void {
  pendingTarget = null;
}

function consumeLinkNavigation(route: Route): boolean {
  const target = pendingTarget;
  pendingTarget = null;
  return target !== null && sameRoute(target, routeHash(route));
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
  const href = anchor?.getAttribute("href");
  if (anchor !== null && href !== null && href !== undefined && !anchor.hasAttribute("target")) {
    markLinkNavigation(href);
  }
}

export function useScrollToTopOnLinkNavigation(route: Route): void {
  useEffect(() => {
    document.addEventListener("click", handleDocumentClick);
    const stopWatchingHolds = onHoldDropped(clearLinkNavigation);
    return () => {
      document.removeEventListener("click", handleDocumentClick);
      stopWatchingHolds();
    };
  }, []);

  useLayoutEffect(() => {
    if (consumeLinkNavigation(route)) {
      window.scrollTo(0, 0);
    }
  }, [route]);
}
