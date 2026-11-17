"use client";

import { useEffect } from "react";

const REVEAL_INSET = 0.1;
const REVEAL_MARGIN = `0px 0px -${REVEAL_INSET * 100}% 0px`;

const WORDS_END_LINE = 0.7;
const WORDS_END_MARGIN = `0px 0px -${Math.round((1 - WORDS_END_LINE) * 100)}% 0px`;
const WORDS_SLACK_RATIO = 0.01;
const WORDS_SLACK_PX = 0.5;

function pinWords(doc: Document, fold: number, lastScroll: number): () => void {
  const scrollY = doc.defaultView?.scrollY ?? 0;
  const line = fold * WORDS_END_LINE;
  const watched = Array.from(doc.querySelectorAll<HTMLElement>(".vk-words:not([data-words-done])"));
  const waiting: HTMLElement[] = [];
  for (const host of watched) {
    const bottom = host.getBoundingClientRect().bottom;
    const reachable = bottom + scrollY - lastScroll <= line;
    if (bottom <= line || !reachable) host.setAttribute("data-words-done", "");
    else waiting.push(host);
  }
  if (waiting.length === 0) return () => undefined;
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const edge = entry.rootBounds?.bottom ?? line;
        const slack = entry.boundingClientRect.height * WORDS_SLACK_RATIO + WORDS_SLACK_PX;
        if (entry.boundingClientRect.bottom > edge + slack) continue;
        entry.target.setAttribute("data-words-done", "");
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: WORDS_END_MARGIN, threshold: [0, 0.99, 1] },
  );
  for (const host of waiting) observer.observe(host);
  return () => observer.disconnect();
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
  const stopWords = pinWords(doc, fold, lastScroll);
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
