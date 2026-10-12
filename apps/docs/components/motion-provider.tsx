"use client";

import { type FeatureBundle, LazyMotion, MotionConfig } from "motion/react";
import type { ReactNode } from "react";

export type MotionFeatures = () => Promise<FeatureBundle>;

export function loadMotionFeatures(): Promise<FeatureBundle> {
  return import("@/lib/motion-features").then((module) => module.default);
}

export function MotionProvider({
  children,
  features = loadMotionFeatures,
}: {
  children: ReactNode;
  features?: MotionFeatures;
}): ReactNode {
  return (
    <LazyMotion features={features} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
