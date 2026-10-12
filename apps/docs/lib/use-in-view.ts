"use client";

import { type RefObject, useEffect, useRef, useState } from "react";

export function useInView<T extends Element>(
  threshold: number,
  { once = false }: { once?: boolean } = {},
): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  const settled = once && inView;

  useEffect(() => {
    const node = ref.current;
    if (!node || settled) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (once) {
          if (entries.some((entry) => entry.isIntersecting)) setInView(true);
          return;
        }
        const last = entries.at(-1);
        if (last) setInView(last.isIntersecting);
      },
      { threshold },
    );
    observer.observe(node);

    return () => observer.disconnect();
  }, [threshold, once, settled]);

  return [ref, inView];
}
