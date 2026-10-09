"use client";

import { type ReactNode, useState } from "react";
import { trackUmamiEvent } from "@/lib/umami";

const ICON = {
  width: 14,
  height: 14,
  viewBox: "0 0 14 14",
  fill: "currentColor",
} as const;

export function MarqueeToggle({ label }: { label: string }): ReactNode {
  const [paused, setPaused] = useState(false);

  function toggle(): void {
    const next = !paused;
    setPaused(next);
    trackUmamiEvent("toggle-marquee", {
      state: next ? "paused" : "playing",
      location: "marquee",
    });
  }

  return (
    <button
      type="button"
      className="vk-marquee-toggle"
      aria-label={label}
      aria-pressed={paused}
      onClick={toggle}
    >
      {paused ? (
        <svg {...ICON} aria-hidden="true">
          <path d="M3.5 2.2v9.6a.6.6 0 0 0 .9.5l7.6-4.8a.6.6 0 0 0 0-1L4.4 1.7a.6.6 0 0 0-.9.5Z" />
        </svg>
      ) : (
        <svg {...ICON} aria-hidden="true">
          <rect x="3" y="2" width="2.75" height="10" rx="0.6" />
          <rect x="8.25" y="2" width="2.75" height="10" rx="0.6" />
        </svg>
      )}
    </button>
  );
}
