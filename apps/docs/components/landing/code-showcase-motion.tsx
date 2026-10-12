"use client";

import { m, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { MotionProvider } from "@/components/motion-provider";

const PANEL_FADE = { duration: 0.24, ease: [0.22, 1, 0.36, 1] } as const;

export function MotionPanel({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}): ReactNode {
  const reduced = useReducedMotion();
  return (
    <MotionProvider>
      <m.div
        initial={false}
        animate={{ opacity: active ? 1 : 0, y: active ? 0 : 4 }}
        transition={reduced ? { duration: 0 } : PANEL_FADE}
      >
        {children}
      </m.div>
    </MotionProvider>
  );
}
