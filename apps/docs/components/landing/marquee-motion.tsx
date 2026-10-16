"use client";

import { type ReactNode, useState } from "react";
import Button from "@/components/ui/button";
import { useHydrated } from "@/lib/use-hydrated";

export type MarqueeState = "running" | "paused";

const GLYPH = {
  width: 14,
  height: 14,
  viewBox: "0 0 24 24",
  fill: "currentColor",
} as const;

export function MarqueeMotion({
  pauseLabel,
  children,
}: {
  pauseLabel: string;
  children: ReactNode;
}): ReactNode {
  const hydrated = useHydrated();
  const [paused, setPaused] = useState(false);
  const state: MarqueeState = paused ? "paused" : "running";

  return (
    <div className="vk-marquee" data-marquee={hydrated ? state : undefined}>
      <Button
        variant="outline"
        size="sm"
        className="vk-marquee-toggle"
        aria-pressed={paused}
        onClick={() => setPaused((current) => !current)}
      >
        <svg {...GLYPH} aria-hidden="true" className="vk-marquee-glyph-pause">
          <path d="M7 5h3v14H7zM14 5h3v14h-3z" />
        </svg>
        <svg {...GLYPH} aria-hidden="true" className="vk-marquee-glyph-play">
          <path d="M8 5v14l11-7z" />
        </svg>
        {pauseLabel}
      </Button>
      {children}
    </div>
  );
}
