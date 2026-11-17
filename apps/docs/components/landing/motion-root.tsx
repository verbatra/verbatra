"use client";

import { useEffect } from "react";

const REVEAL_INSET = 0.1;
const REVEAL_MARGIN = `0px 0px -${REVEAL_INSET * 100}% 0px`;

const WORDS_END_LINE = 0.7;
const WORDS_END_MARGIN = `0px 0px -${Math.round((1 - WORDS_END_LINE) * 100)}% 0px`;
const WORDS_SLACK_RATIO = 0.01;
const WORDS_SLACK_PX = 0.5;

interface PageMeasure {
  fold: number;
  line: number;
  lastScroll: number;
}

function measurePage(doc: Document): PageMeasure {
  const fold = doc.defaultView?.innerHeight ?? 0;
  return {
    fold,
    line: fold * WORDS_END_LINE,
    lastScroll: Math.max(0, doc.documentElement.scrollHeight - fold),
  };
}

function wordsAreSettled(host: HTMLElement, scrollY: number, page: PageMeasure): boolean {
  const bottom = host.getBoundingClientRect().bottom;
  const reachable = bottom + scrollY - page.lastScroll <= page.line;
  return bottom <= page.line || !reachable;
}

function pinWords(doc: Document): () => void {
  const view = doc.defaultView;
  const initial = measurePage(doc);
  const watched = Array.from(doc.querySelectorAll<HTMLElement>(".vk-words:not([data-words-done])"));
  const waiting = new Set<HTMLElement>();
  for (const host of watched) {
    const visibleAtMount = host.getBoundingClientRect().top < initial.fold;
    if (visibleAtMount || wordsAreSettled(host, view?.scrollY ?? 0, initial))
      host.setAttribute("data-words-done", "");
    else waiting.add(host);
  }
  if (waiting.size === 0) return () => undefined;
  const finish = (host: HTMLElement) => {
    host.setAttribute("data-words-done", "");
    waiting.delete(host);
    observer.unobserve(host);
  };
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const edge = entry.rootBounds?.bottom ?? initial.line;
        const slack = entry.boundingClientRect.height * WORDS_SLACK_RATIO + WORDS_SLACK_PX;
        const passed = entry.boundingClientRect.bottom < 0;
        if (!passed && entry.boundingClientRect.bottom > edge + slack) continue;
        finish(entry.target as HTMLElement);
      }
    },
    { rootMargin: WORDS_END_MARGIN, threshold: [0, 0.99, 1] },
  );
  for (const host of waiting) observer.observe(host);
  const onResize = () => {
    const page = measurePage(doc);
    for (const host of Array.from(waiting))
      if (wordsAreSettled(host, view?.scrollY ?? 0, page)) finish(host);
  };
  view?.addEventListener("resize", onResize);
  return () => {
    view?.removeEventListener("resize", onResize);
    observer.disconnect();
  };
}

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
  const stopWords = pinWords(doc);
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
    stopWords();
    root.removeAttribute("data-motion-ready");
  };
}

export function MotionRoot(): null {
  useEffect(() => startMotion(), []);
  return null;
}
