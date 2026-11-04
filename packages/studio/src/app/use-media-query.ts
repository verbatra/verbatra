import { useEffect, useState } from "react";

export const XL_QUERY = "(min-width: 80rem)";

function currentMatch(query: string, fallback: boolean): boolean {
  return typeof window.matchMedia === "function" ? window.matchMedia(query).matches : fallback;
}

export function useMediaQuery(query: string, fallback: boolean): boolean {
  const [matches, setMatches] = useState(() => currentMatch(query, fallback));

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return;
    }
    const list = window.matchMedia(query);
    const update = (): void => setMatches(list.matches);
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, [query]);

  return matches;
}
