"use client";

import { AnimatePresence, motion, useInView } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useReducedMotionPreference } from "@/lib/reduced-motion";
import { cn } from "@/lib/utils";

export type SwapLogo = { key: string; name: string; icon: ReactNode };

const EASE = [0.22, 1, 0.36, 1] as const;

export function SwapLogoCloud({
  logos,
  visibleCount,
  label,
  gridClassName,
  intervalMs = 3000,
}: {
  logos: ReadonlyArray<SwapLogo>;
  visibleCount: number;
  label: string;
  gridClassName: string;
  intervalMs?: number;
}): ReactNode {
  const reduced = useReducedMotionPreference();
  const rootRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);
  const inView = useInView(rootRef, { amount: 0.2 });
  const canSwap = !reduced && logos.length > visibleCount;

  useEffect(() => {
    if (!canSwap || !inView) return;
    const id = setInterval(() => {
      setOffset((current) => (current + visibleCount) % logos.length);
    }, intervalMs);
    return () => clearInterval(id);
  }, [canSwap, inView, visibleCount, logos.length, intervalMs]);

  if (logos.length === 0) return null;

  const slots: SwapLogo[] = [];
  if (reduced) {
    slots.push(...logos);
  } else {
    for (let i = 0; i < visibleCount; i += 1) {
      const item = logos[(offset + i) % logos.length];
      if (item) slots.push(item);
    }
  }

  return (
    <div ref={rootRef}>
      <ul className="sr-only">
        <li>{label}:</li>
        {logos.map((logo) => (
          <li key={logo.key}>{logo.name}</li>
        ))}
      </ul>
      <div className={cn("grid items-center gap-x-4 gap-y-8", gridClassName)} aria-hidden="true">
        {slots.map((logo, i) => (
          <div key={`slot-${i}`} className="flex items-center justify-center">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={logo.key}
                initial={reduced ? false : { opacity: 0, x: 40, filter: "blur(6px)" }}
                animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                exit={reduced ? undefined : { opacity: 0, x: -40, filter: "blur(6px)" }}
                transition={
                  reduced ? { duration: 0 } : { duration: 0.5, delay: i * 0.05, ease: EASE }
                }
                className="flex flex-col items-center gap-2.5"
              >
                <span className="text-[color:var(--accent)]">{logo.icon}</span>
                <span
                  className="text-[13px] font-medium text-fd-muted-foreground"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {logo.name}
                </span>
              </motion.div>
            </AnimatePresence>
          </div>
        ))}
      </div>
    </div>
  );
}
