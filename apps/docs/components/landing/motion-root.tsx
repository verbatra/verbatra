"use client";

import { useEffect } from "react";

type PresenceEntry = Pick<IntersectionObserverEntry, "isIntersecting" | "boundingClientRect"> & {
  rootBounds?: DOMRectReadOnly | null;
};

const REVEAL_MARGIN = "0px 0px -10% 0px";

export const EDGE_FADE_PX = 48;

export const LANDING_OFFSET_PROPERTY = "--vk-landing-offset";

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

function keepInView(link: Element): void {
  const scroller = link.closest("[data-nav-scroller]");
  if (!scroller) return;
  if (scroller.querySelector("[data-nav-link]") === link) {
    if (scroller.scrollLeft > 0) scroller.scrollTo({ left: 0 });
    return;
  }
  const box = scroller.getBoundingClientRect();
  const item = link.getBoundingClientRect();
  const left =
    Math.min(0, item.left - box.left) + Math.max(0, item.right - box.right + EDGE_FADE_PX);
  if (left) scroller.scrollBy({ left });
}

function markCurrent(links: Map<Element, Element>, shown: Set<Element>): void {
  let current: Element | undefined;
  for (const section of links.keys()) if (!current && shown.has(section)) current = section;
  for (const [section, link] of links) {
    if (section !== current) link.removeAttribute("aria-current");
    else if (!link.hasAttribute("aria-current")) {
      link.setAttribute("aria-current", "true");
      keepInView(link);
    }
  }
}

function applyPresence(entry: IntersectionObserverEntry, root: HTMLElement): void {
  const target = entry.target as HTMLElement;
  const presence = target.dataset.presence;
  if (presence === "hero") root.toggleAttribute("data-past-hero", isPastHero(entry));
  else if (presence === "final-cta") root.toggleAttribute("data-final-cta", entry.isIntersecting);
  else target.toggleAttribute("data-offscreen", !entry.isIntersecting);
}

export function landingOffset(doc: Document): number {
  const view = doc.defaultView;
  const home = doc.querySelector(".vk-home");
  if (!view || !home) return 0;
  const rem = Number.parseFloat(view.getComputedStyle(doc.documentElement).fontSize);
  const offset = view.getComputedStyle(home).getPropertyValue(LANDING_OFFSET_PROPERTY);
  return Number.parseFloat(offset) * rem || 0;
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
  const offset = landingOffset(doc);
  const hero = doc.querySelector('[data-presence="hero"]');
  root.toggleAttribute("data-past-hero", !!hero && hero.getBoundingClientRect().bottom <= offset);
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
    { rootMargin: `-${offset}px 0px 0px 0px` },
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
    for (const link of links.values()) link.removeAttribute("aria-current");
  };
}

export function MotionRoot(): null {
  useEffect(() => startMotion(), []);
  return null;
}
