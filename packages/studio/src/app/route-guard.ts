export const ROUTE_CHANGE_EVENT = "verbatra:route-change";

export type RouteWrite = "push" | "replace";

export interface RouteGuard {
  isDirty(): boolean;
  onBlock(proceed: () => Promise<void>): void;
  onRelease?(): void;
}

interface Held {
  readonly idx: number;
  readonly hash: string;
  readonly positionGone: boolean;
}

let activeGuard: RouteGuard | null = null;
let position: number | null = null;
let positionHash = "";
let held: Held | null = null;

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
  return held === null ? window.location.hash : positionHash;
}

export function writeRoute(kind: RouteWrite, next: string): void {
  const base = readIdx() ?? 0;
  const idx = kind === "push" ? base + 1 : base;
  if (kind === "push") {
    window.history.pushState({ idx }, "", next);
  } else {
    window.history.replaceState({ idx }, "", next);
  }
  held = null;
  position = idx;
  positionHash = next;
  announceRouteChange();
}

function adopt(idx: number): void {
  held = null;
  position = idx;
  positionHash = window.location.hash;
}

function proceedHeld(): Promise<void> {
  if (held !== null) {
    position = readIdx() ?? held.idx;
    positionHash = window.location.hash;
    held = null;
    announceRouteChange();
  }
  return Promise.resolve();
}

function stampLanding(): { readonly idx: number; readonly truncated: boolean } {
  const idx = readIdx();
  if (idx !== null) {
    return { idx, truncated: false };
  }
  const known = (held?.idx ?? position ?? 0) + 1;
  window.history.replaceState({ idx: known }, "", window.location.href);
  return { idx: known, truncated: position !== null && known <= position };
}

function handleLanding(): void {
  const here = window.location.hash;
  if (held !== null && held.idx === readIdx() && held.hash === here) {
    return;
  }
  const { idx, truncated } = stampLanding();
  const gone = truncated || (held?.positionGone ?? false);
  if (!gone && idx === position) {
    if (held !== null) {
      held = null;
      activeGuard?.onRelease?.();
    }
    return;
  }
  const guard = activeGuard;
  if (guard === null || !guard.isDirty() || position === null) {
    adopt(idx);
    return;
  }
  const wasIdle = held === null;
  held = { idx, hash: here, positionGone: gone };
  if (wasIdle) {
    guard.onBlock(proceedHeld);
  }
}

export function restoreHeldRoute(): void {
  const target = held;
  held = null;
  if (target === null || position === null) {
    return;
  }
  if (target.positionGone) {
    const current = readIdx() ?? target.idx;
    window.history.replaceState({ idx: current }, "", positionHash);
    position = current;
    return;
  }
  const delta = position - target.idx;
  if (delta !== 0) {
    window.history.go(delta);
  }
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
  window.addEventListener("popstate", handleLanding);
  window.addEventListener("hashchange", handleLanding);
}

export function installRouteGuard(guard: RouteGuard): () => void {
  activeGuard = guard;
  position = readIdx();
  positionHash = window.location.hash;
  held = null;
  return () => {
    if (activeGuard === guard) {
      activeGuard = null;
      held = null;
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
