"use client";

import { type ReactNode, useEffect, useState } from "react";
import Button from "@/components/ui/button";
import { useHydrated } from "@/lib/use-hydrated";

export type MarqueeState = "running" | "paused";

export const GLINT_THRESHOLD = 0.5;

const GLYPH = {
  width: 14,
  height: 14,
  viewBox: "0 0 24 24",
  fill: "currentColor",
} as const;

function useSeen(): [(node: HTMLDivElement | null) => void, boolean] {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    if (node === null || seen || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        setSeen(true);
      },
      { threshold: GLINT_THRESHOLD },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, seen]);

  return [setNode, seen];
}

export function MarqueeMotion({
  pauseLabel,
  playLabel,
  children,
}: {
  pauseLabel: string;
  playLabel: string;
  children: ReactNode;
}): ReactNode {
  const hydrated = useHydrated();
  const [paused, setPaused] = useState(false);
  const [observe, seen] = useSeen();
  const state: MarqueeState = paused ? "paused" : "running";

  return (
    <div
      ref={observe}
      className="vk-marquee"
      data-marquee={hydrated ? state : undefined}
      data-glint={seen ? "on" : undefined}
    >
      <Button
        variant="outline"
        size="md"
        className="vk-marquee-toggle"
        onClick={() => setPaused((current) => !current)}
      >
        <svg {...GLYPH} aria-hidden="true" className="vk-marquee-glyph-pause">
          <path d="M7 5h3v14H7zM14 5h3v14h-3z" />
        </svg>
        <svg {...GLYPH} aria-hidden="true" className="vk-marquee-glyph-play">
          <path d="M8 5v14l11-7z" />
        </svg>
        {paused ? playLabel : pauseLabel}
      </Button>
      {children}
    </div>
  );
}
