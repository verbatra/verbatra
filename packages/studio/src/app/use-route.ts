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
import {
  announceRouteChange,
  commitHash,
  ROUTE_CHANGE_EVENT,
  routeChangeBlocked,
} from "./route-guard.js";

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
  return window.location.hash;
}

export function replaceRoute(route: Route): boolean {
  const next = routeHash(route);
  if (next === window.location.hash || routeChangeBlocked(next)) {
    return false;
  }
  commitHash(next);
  return true;
}

export function navigateToPage(page: PageId): boolean {
  if (parseRoute(window.location.hash).page === page) {
    return true;
  }
  const next = pageHash(page);
  if (routeChangeBlocked(next)) {
    return false;
  }
  window.location.hash = next;
  announceRouteChange();
  return true;
}

export function navigateToRoute(route: Route): boolean {
  const next = routeHash(route);
  if (routeChangeBlocked(next)) {
    return false;
  }
  window.location.hash = next;
  announceRouteChange();
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
      window.history.replaceState(window.history.state, "", canonical);
      announceRouteChange();
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
