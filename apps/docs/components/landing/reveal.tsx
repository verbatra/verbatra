"use client";

import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "@/lib/reduced-motion";
import { cn } from "@/lib/utils";

const STEP_MS = 110;
const VIEWPORT_LINE = 0.9;

function isPastViewportLine(node: Element): boolean {
  return node.getBoundingClientRect().top < window.innerHeight * VIEWPORT_LINE;
}

function watchUntilInView(node: Element, onIn: () => void): () => void {
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) onIn();
    },
    { threshold: 0.15 },
  );
  observer.observe(node);

  let frame = 0;
  const onScroll = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (isPastViewportLine(node)) onIn();
    });
  };
  window.addEventListener("scroll", onScroll, { passive: true });

  return () => {
    observer.disconnect();
    window.removeEventListener("scroll", onScroll);
    if (frame) cancelAnimationFrame(frame);
  };
}

export function Reveal({
  order = 0,
  className,
  style,
  children,
}: {
  order?: number;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}): ReactNode {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || inView) return;
    if (prefersReducedMotion() || isPastViewportLine(node)) {
      setInView(true);
      return;
    }
    return watchUntilInView(node, () => setInView(true));
  }, [inView]);

  return (
    <div
      ref={ref}
      className={cn("vk-reveal", inView && "is-in", className)}
      style={{ ...style, transitionDelay: `${order * STEP_MS}ms` }}
    >
      {children}
    </div>
  );
}
