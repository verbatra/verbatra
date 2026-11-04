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

const EMPTY_PARAMS: RouteParams = {};
const ROUTE_CHANGE_EVENT = "verbatra:route-change";

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

function announceRouteChange(): void {
  window.dispatchEvent(new Event(ROUTE_CHANGE_EVENT));
}

export function replaceRoute(route: Route): void {
  const next = routeHash(route);
  if (next === window.location.hash) {
    return;
  }
  window.history.replaceState(window.history.state, "", next);
  announceRouteChange();
}

export function navigateToPage(page: PageId): void {
  if (parseRoute(window.location.hash).page === page) {
    return;
  }
  window.location.hash = pageHash(page);
  announceRouteChange();
}

export function navigateToRoute(route: Route): void {
  window.location.hash = routeHash(route);
  announceRouteChange();
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

export function useRouteParams(page: PageId): readonly [RouteParams, (next: RouteParams) => void] {
  const route = useRoute();
  const params = route.page === page ? route.params : EMPTY_PARAMS;
  const setParams = useCallback(
    (next: RouteParams) => replaceRoute({ page, params: next }),
    [page],
  );
  return [params, setParams];
}
