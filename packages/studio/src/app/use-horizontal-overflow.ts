import type { RefObject } from "react";
import { useEffect, useState } from "react";

export function useHorizontalOverflow(targetRef: RefObject<HTMLElement | null>): boolean {
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const target = targetRef.current;
    if (target === null) {
      return;
    }
    const measure = (): void => setOverflows(target.scrollWidth > target.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(target);
    for (const child of target.children) {
      observer.observe(child);
    }
    return () => observer.disconnect();
  }, [targetRef]);

  return overflows;
}
