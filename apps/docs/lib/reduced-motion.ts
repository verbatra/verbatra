const REDUCE_QUERY = "(prefers-reduced-motion: reduce)";

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(REDUCE_QUERY).matches;
}

export function subscribeReducedMotion(listener: (reduced: boolean) => void): () => void {
  const media = window.matchMedia(REDUCE_QUERY);
  const onChange = (): void => listener(media.matches);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
