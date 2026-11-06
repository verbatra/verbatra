import { useEffect, useLayoutEffect } from "react";
import { parseRoute, type Route, routeHash } from "../client/routes.js";

const PENDING_LIFETIME_MS = 120_000;

interface Pending {
  readonly target: string;
  readonly at: number;
}

let pending: Pending | null = null;

function sameRoute(left: string, right: string): boolean {
  return routeHash(parseRoute(left)) === routeHash(parseRoute(right));
}

export function markLinkNavigation(target: string): void {
  pending = { target, at: Date.now() };
}

function consumeLinkNavigation(route: Route): boolean {
  const mark = pending;
  pending = null;
  return (
    mark !== null &&
    Date.now() - mark.at <= PENDING_LIFETIME_MS &&
    sameRoute(mark.target, routeHash(route))
  );
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
    return () => document.removeEventListener("click", handleDocumentClick);
  }, []);

  useLayoutEffect(() => {
    if (consumeLinkNavigation(route)) {
      window.scrollTo(0, 0);
    }
  }, [route]);
}
