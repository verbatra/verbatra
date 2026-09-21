"use client";

import { useSyncExternalStore } from "react";

const REDUCE_QUERY = "(prefers-reduced-motion: reduce)";

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(REDUCE_QUERY).matches;
}

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(REDUCE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function useReducedMotionPreference(): boolean {
  return useSyncExternalStore(subscribe, prefersReducedMotion, () => false);
}
