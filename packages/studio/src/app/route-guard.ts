export const ROUTE_CHANGE_EVENT = "verbatra:route-change";

export interface RouteGuard {
  isDirty(): boolean;
  onBlock(proceed: () => void): void;
}

let activeGuard: RouteGuard | null = null;
let anchorHash = "";

export function announceRouteChange(): void {
  window.dispatchEvent(new Event(ROUTE_CHANGE_EVENT));
}

export function commitHash(next: string): void {
  anchorHash = next;
  window.history.replaceState(window.history.state, "", next);
  announceRouteChange();
}

function followHash(): void {
  if (activeGuard !== null && !activeGuard.isDirty()) {
    anchorHash = window.location.hash;
  }
}

function handleHashChange(): void {
  const guard = activeGuard;
  const reached = window.location.hash;
  if (guard === null || reached === anchorHash) {
    return;
  }
  if (!guard.isDirty()) {
    anchorHash = reached;
    return;
  }
  window.history.replaceState(window.history.state, "", anchorHash);
  announceRouteChange();
  guard.onBlock(() => commitHash(reached));
}

if (typeof window !== "undefined") {
  window.addEventListener("hashchange", handleHashChange);
  window.addEventListener(ROUTE_CHANGE_EVENT, followHash);
}

export function installRouteGuard(guard: RouteGuard): () => void {
  activeGuard = guard;
  anchorHash = window.location.hash;
  return () => {
    if (activeGuard === guard) {
      activeGuard = null;
    }
  };
}

export function routeChangeBlocked(next: string): boolean {
  const guard = activeGuard;
  if (guard === null || next === window.location.hash || !guard.isDirty()) {
    return false;
  }
  guard.onBlock(() => commitHash(next));
  return true;
}
