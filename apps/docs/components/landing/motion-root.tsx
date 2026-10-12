"use client";

import { useEffect } from "react";

const REVEAL_MARGIN = "0px 0px -10% 0px";

export function startMotion(doc: Document = document): () => void {
  const root = doc.documentElement;
  const pending = Array.from(
    doc.querySelectorAll<HTMLElement>("[data-reveal]:not([data-revealed])"),
  );
  const fold = doc.defaultView?.innerHeight ?? 0;
  const reveal = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.setAttribute("data-revealed", "");
        reveal.unobserve(entry.target);
      }
    },
    { rootMargin: REVEAL_MARGIN },
  );
  for (const element of pending) {
    if (element.getBoundingClientRect().top < fold) element.setAttribute("data-revealed", "");
    else reveal.observe(element);
  }
  root.setAttribute("data-motion-ready", "");

  return () => {
    reveal.disconnect();
    root.removeAttribute("data-motion-ready");
  };
}

export function MotionRoot(): null {
  useEffect(() => startMotion(), []);
  return null;
}
