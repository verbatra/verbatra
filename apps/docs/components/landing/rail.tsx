"use client";

import type { FocusEvent, ReactNode } from "react";
import { prefersReducedMotion } from "@/lib/reduced-motion";
import { cn } from "@/lib/utils";

const RAIL_ITEM_CLASS = "vk-rail-item";

const RAIL_QUERY = "(max-width: 1023px)";

function revealFocusedItem(event: FocusEvent<HTMLElement>): void {
  if (!(event.target instanceof Element) || !window.matchMedia(RAIL_QUERY).matches) return;
  const item = event.target.closest(`.${RAIL_ITEM_CLASS}`);
  item?.scrollIntoView({
    block: "nearest",
    inline: "start",
    behavior: prefersReducedMotion() ? "auto" : "smooth",
  });
}

export function Rail({
  labelledBy,
  className,
  children,
}: {
  labelledBy: string;
  className?: string;
  children: ReactNode;
}): ReactNode {
  return (
    <section
      aria-labelledby={labelledBy}
      className={cn("vk-rail vk-edge-fade", className)}
      onFocus={revealFocusedItem}
    >
      {children}
    </section>
  );
}
