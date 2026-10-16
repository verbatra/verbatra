"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "@/lib/reduced-motion";

export type HeroDiffState = "filled" | "missing";

export const HERO_DIFF_FILL_RATIO = 0.6;

const THRESHOLDS = [0, HERO_DIFF_FILL_RATIO];

export function HeroDiffMotion({ children }: { children: ReactNode }): ReactNode {
  const ref = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<HeroDiffState>("filled");

  useEffect(() => {
    const node = ref.current;
    if (!node || prefersReducedMotion()) return;
    let first = true;
    const observer = new IntersectionObserver(
      (entries) => {
        const ratio = Math.max(...entries.map((entry) => entry.intersectionRatio));
        const visible = entries.some((entry) => entry.isIntersecting);
        if (first) {
          first = false;
          if (visible) observer.disconnect();
          else setState("missing");
          return;
        }
        if (visible && ratio >= HERO_DIFF_FILL_RATIO) {
          observer.disconnect();
          setState("filled");
        }
      },
      { threshold: THRESHOLDS },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="vk-hero-diff-motion" data-diff-state={state}>
      {children}
    </div>
  );
}
