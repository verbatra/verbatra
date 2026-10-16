"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "@/lib/reduced-motion";

export type HeroDiffState = "filled" | "missing";

export const HERO_DIFF_FILL_RATIO = 0.6;

export const HERO_DIFF_FILL_VIEWPORT_SHARE = 0.4;

export const HERO_DIFF_FILL_TIMEOUT_MS = 2000;

const THRESHOLDS = Array.from({ length: 21 }, (_, step) => step / 20);

function viewportHeight(entry: IntersectionObserverEntry): number {
  return entry.rootBounds?.height ?? window.innerHeight;
}

function isMeaningfullyVisible(entry: IntersectionObserverEntry): boolean {
  if (!entry.isIntersecting) return false;
  if (entry.intersectionRatio >= HERO_DIFF_FILL_RATIO) return true;
  return entry.intersectionRect.height >= viewportHeight(entry) * HERO_DIFF_FILL_VIEWPORT_SHARE;
}

export function HeroDiffMotion({ children }: { children: ReactNode }): ReactNode {
  const ref = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<HeroDiffState>("filled");

  useEffect(() => {
    const node = ref.current;
    if (!node || prefersReducedMotion()) return;
    let first = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((entry) => entry.isIntersecting);
        if (first) {
          first = false;
          if (visible) observer.disconnect();
          else setState("missing");
          return;
        }
        if (entries.some(isMeaningfullyVisible)) {
          fill();
          return;
        }
        if (visible && timer === undefined) timer = setTimeout(fill, HERO_DIFF_FILL_TIMEOUT_MS);
      },
      { threshold: THRESHOLDS },
    );
    function fill(): void {
      clearTimeout(timer);
      observer.disconnect();
      setState("filled");
    }
    observer.observe(node);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, []);

  return (
    <div ref={ref} className="vk-hero-diff-motion" data-diff-state={state}>
      {children}
    </div>
  );
}
