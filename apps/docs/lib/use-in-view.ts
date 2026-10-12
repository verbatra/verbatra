"use client";

import { type RefObject, useEffect, useRef, useState } from "react";

export function useInView<T extends Element>(
  threshold: number,
  enabled = true,
): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || !enabled) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const last = entries[entries.length - 1];
        if (last) setInView(last.isIntersecting);
      },
      { threshold },
    );
    observer.observe(node);

    return () => observer.disconnect();
  }, [threshold, enabled]);

  return [ref, inView];
}
