import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import {
  canonicalPageHash,
  type PageId,
  pageHash,
  parseRoute,
  type Route,
  type RouteParams,
  routeHash,
} from "../client/routes.js";
import { markLinkNavigation } from "./link-scroll.js";
import { ROUTE_CHANGE_EVENT, routeChangeBlocked, visibleHash, writeRoute } from "./route-guard.js";

const EMPTY_PARAMS: RouteParams = {};

function subscribe(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  window.addEventListener(ROUTE_CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("hashchange", onChange);
    window.removeEventListener(ROUTE_CHANGE_EVENT, onChange);
  };
}

function currentHash(): string {
  return visibleHash();
}

export function replaceRoute(route: Route): boolean {
  const next = routeHash(route);
  if (next === visibleHash() || routeChangeBlocked(next, "replace")) {
    return false;
  }
  writeRoute("replace", next);
  return true;
}

export function navigateToPage(page: PageId): boolean {
  if (parseRoute(visibleHash()).page === page) {
    return true;
  }
  const next = pageHash(page);
  markLinkNavigation(next);
  if (routeChangeBlocked(next, "push")) {
    return false;
  }
  writeRoute("push", next);
  return true;
}

export function navigateToRoute(route: Route): boolean {
  const next = routeHash(route);
  if (next === visibleHash()) {
    return true;
  }
  markLinkNavigation(next);
  if (routeChangeBlocked(next, "push")) {
    return false;
  }
  writeRoute("push", next);
  return true;
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, currentHash);
  return useMemo(() => parseRoute(hash), [hash]);
}

export function useCanonicalHash(): void {
  const hash = useSyncExternalStore(subscribe, currentHash);
  useEffect(() => {
    const canonical = canonicalPageHash(hash);
    if (canonical !== null) {
      writeRoute("replace", canonical);
    }
  }, [hash]);
}

export function useRouteParams(
  page: PageId,
): readonly [RouteParams, (next: RouteParams) => boolean] {
  const route = useRoute();
  const params = route.page === page ? route.params : EMPTY_PARAMS;
  const setParams = useCallback(
    (next: RouteParams) => replaceRoute({ page, params: next }),
    [page],
  );
  return [params, setParams];
}
