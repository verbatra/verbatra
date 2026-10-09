"use client";

import { useEffect } from "react";

type PresenceEntry = Pick<IntersectionObserverEntry, "isIntersecting" | "boundingClientRect"> & {
  rootBounds?: DOMRectReadOnly | null;
};

const REVEAL_MARGIN = "0px 0px -10% 0px";

export const PRESENCE_MARGIN = "-112px 0px 0px 0px";

export function isPastHero(entry: PresenceEntry): boolean {
  return !entry.isIntersecting && entry.boundingClientRect.bottom <= (entry.rootBounds?.top ?? 0);
}

function navLinks(doc: Document): Map<Element, Element> {
  const links = new Map<Element, Element>();
  for (const link of doc.querySelectorAll<HTMLAnchorElement>("[data-nav-link]")) {
    const section = doc.getElementById(link.hash.slice(1));
    if (section) links.set(section, link);
  }
  return links;
}

function markCurrent(links: Map<Element, Element>, shown: Set<Element>): void {
  let current: Element | undefined;
  for (const section of links.keys()) if (!current && shown.has(section)) current = section;
  for (const [section, link] of links) {
    if (section === current) link.setAttribute("aria-current", "true");
    else link.removeAttribute("aria-current");
  }
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
  const links = navLinks(doc);
  const shown = new Set<Element>();
  const presence = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!links.has(entry.target)) applyPresence(entry, root);
        else if (entry.isIntersecting) shown.add(entry.target);
        else shown.delete(entry.target);
      }
      markCurrent(links, shown);
    },
    { rootMargin: PRESENCE_MARGIN },
  );
  for (const element of doc.querySelectorAll("[data-presence]")) presence.observe(element);
  for (const section of links.keys()) presence.observe(section);
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
