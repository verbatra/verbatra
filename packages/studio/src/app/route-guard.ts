export const ROUTE_CHANGE_EVENT = "verbatra:route-change";

export type RouteWrite = "push" | "replace";

export interface RouteGuard {
  isDirty(): boolean;
  onBlock(proceed: () => Promise<void>): void;
}

let activeGuard: RouteGuard | null = null;
let position: number | null = null;
let positionHash = "";
let undoing = false;
let correctedFrom: number | null = null;
let admitting = false;
let landings: Array<() => void> = [];

function readIdx(): number | null {
  const state: unknown = window.history.state;
  if (typeof state === "object" && state !== null && "idx" in state) {
    return typeof state.idx === "number" ? state.idx : null;
  }
  return null;
}

export function announceRouteChange(): void {
  window.dispatchEvent(new Event(ROUTE_CHANGE_EVENT));
}

export function visibleHash(): string {
  return undoing ? positionHash : window.location.hash;
}

export function writeRoute(kind: RouteWrite, next: string): void {
  const base = readIdx() ?? 0;
  const idx = kind === "push" ? base + 1 : base;
  if (kind === "push") {
    window.history.pushState({ idx }, "", next);
  } else {
    window.history.replaceState({ idx }, "", next);
  }
  position = idx;
  positionHash = next;
  announceRouteChange();
}

function adopt(idx: number | null): void {
  const known = idx ?? (position === null ? null : position + 1);
  if (idx === null && known !== null) {
    window.history.replaceState({ idx: known }, "", window.location.href);
  }
  position = known;
  positionHash = window.location.hash;
}

function continueUndo(idx: number | null, home: number): void {
  if (idx === home) {
    undoing = false;
    correctedFrom = null;
  } else if (idx !== correctedFrom) {
    correctedFrom = idx;
    window.history.go(home - (idx ?? home + 1));
  }
}

function releaseLandings(): void {
  const waiting = landings;
  landings = [];
  for (const resolve of waiting) {
    resolve();
  }
}

function holdTraversal(guard: RouteGuard, idx: number | null, home: number): void {
  const delta = (idx ?? home + 1) - home;
  undoing = true;
  correctedFrom = idx;
  window.history.go(-delta);
  guard.onBlock(
    () =>
      new Promise<void>((resolve) => {
        admitting = true;
        landings.push(resolve);
        window.history.go(delta);
      }),
  );
}

function handleTraversal(): void {
  const idx = readIdx();
  if (undoing && position !== null) {
    continueUndo(idx, position);
    return;
  }
  if (idx !== null && idx === position) {
    return;
  }
  const guard = activeGuard;
  const admitted = admitting;
  admitting = false;
  if (guard === null || admitted || !guard.isDirty() || position === null) {
    adopt(idx);
    if (admitted) {
      releaseLandings();
    }
    return;
  }
  holdTraversal(guard, idx, position);
}

function handleBeforeUnload(event: BeforeUnloadEvent): void {
  event.preventDefault();
  event.returnValue = "";
}

export function setUnloadWarning(active: boolean): void {
  window.removeEventListener("beforeunload", handleBeforeUnload);
  if (active) {
    window.addEventListener("beforeunload", handleBeforeUnload);
  }
}

if (typeof window !== "undefined") {
  position = readIdx();
  if (position === null) {
    position = 0;
    window.history.replaceState({ idx: 0 }, "", window.location.href);
  }
  positionHash = window.location.hash;
  window.addEventListener("popstate", handleTraversal);
  window.addEventListener("hashchange", handleTraversal);
}

export function installRouteGuard(guard: RouteGuard): () => void {
  activeGuard = guard;
  position = readIdx();
  positionHash = window.location.hash;
  undoing = false;
  correctedFrom = null;
  admitting = false;
  return () => {
    if (activeGuard === guard) {
      activeGuard = null;
      undoing = false;
      setUnloadWarning(false);
    }
  };
}

export function routeChangeBlocked(next: string, kind: RouteWrite): boolean {
  const guard = activeGuard;
  if (guard === null || next === visibleHash() || !guard.isDirty()) {
    return false;
  }
  guard.onBlock(() => {
    writeRoute(kind, next);
    return Promise.resolve();
  });
  return true;
}
