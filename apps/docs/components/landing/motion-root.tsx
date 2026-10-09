"use client";

import { useEffect } from "react";

type PresenceEntry = Pick<IntersectionObserverEntry, "isIntersecting" | "boundingClientRect">;

const REVEAL_MARGIN = "0px 0px -10% 0px";

export function isPastHero(entry: PresenceEntry): boolean {
  return !entry.isIntersecting && entry.boundingClientRect.bottom <= 0;
}

function applyPresence(entry: IntersectionObserverEntry, root: HTMLElement): void {
  const target = entry.target as HTMLElement;
  const presence = target.dataset.presence;
  if (presence === "hero") root.toggleAttribute("data-past-hero", isPastHero(entry));
  else if (presence === "final-cta") root.toggleAttribute("data-final-cta", entry.isIntersecting);
  else target.toggleAttribute("data-offscreen", !entry.isIntersecting);
}

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
  const presence = new IntersectionObserver((entries) => {
    for (const entry of entries) applyPresence(entry, root);
  });
  for (const element of doc.querySelectorAll("[data-presence]")) presence.observe(element);
  root.setAttribute("data-motion-ready", "");

  return () => {
    reveal.disconnect();
    presence.disconnect();
    root.removeAttribute("data-motion-ready");
    root.removeAttribute("data-past-hero");
    root.removeAttribute("data-final-cta");
  };
}

export function MotionRoot(): null {
  useEffect(() => startMotion(), []);
  return null;
}
