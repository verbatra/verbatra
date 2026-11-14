"use client";

import { useEffect } from "react";

const REVEAL_INSET = 0.1;
const REVEAL_MARGIN = `0px 0px -${REVEAL_INSET * 100}% 0px`;

function revealer(options: IntersectionObserverInit): IntersectionObserver {
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.setAttribute("data-revealed", "");
      observer.unobserve(entry.target);
    }
  }, options);
  return observer;
}

export function startMotion(doc: Document = document): () => void {
  const root = doc.documentElement;
  const pending = Array.from(
    doc.querySelectorAll<HTMLElement>("[data-reveal]:not([data-revealed])"),
  );
  const view = doc.defaultView;
  const fold = view?.innerHeight ?? 0;
  const lastScroll = Math.max(0, root.scrollHeight - fold);
  const reveal = revealer({ rootMargin: REVEAL_MARGIN });
  const revealAtEnd = revealer({});
  const offscreen: HTMLElement[] = [];
  for (const element of pending) {
    if (element.getBoundingClientRect().top < fold) element.setAttribute("data-revealed", "");
    else offscreen.push(element);
  }
  root.setAttribute("data-motion-ready", "");
  for (const element of offscreen) {
    const top = element.getBoundingClientRect().top;
    if (top + (view?.scrollY ?? 0) - lastScroll >= fold * (1 - REVEAL_INSET))
      revealAtEnd.observe(element);
    else reveal.observe(element);
  }

  return () => {
    reveal.disconnect();
    revealAtEnd.disconnect();
    root.removeAttribute("data-motion-ready");
  };
}

export function MotionRoot(): null {
  useEffect(() => startMotion(), []);
  return null;
}
