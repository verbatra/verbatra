"use client";

import { useEffect } from "react";

const QUESTION_SELECTOR = "[data-faq] > summary";

export const FAQ_KEYS_ATTACHED = "data-faq-keys";

export const FAQ_HEAD_SIZE = "--faq-head-size";

const ASIDE_SELECTOR = ".vk-faq-aside";

const HEAD_SELECTOR = ":scope > .vk-section-head-aside";

function nextIndex(key: string, current: number, count: number): number | null {
  switch (key) {
    case "ArrowDown":
      return (current + 1) % count;
    case "ArrowUp":
      return (current - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

function moveFaqFocus(list: HTMLElement, event: KeyboardEvent): void {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
    return;
  if (!(event.target instanceof HTMLElement)) return;
  const questions = Array.from(list.querySelectorAll<HTMLElement>(QUESTION_SELECTOR));
  const current = questions.indexOf(event.target);
  if (current === -1) return;
  const target = nextIndex(event.key, current, questions.length);
  if (target === null) return;
  event.preventDefault();
  questions[target]?.focus();
}

function trackHeadSize(list: HTMLElement): () => void {
  const aside = list.closest<HTMLElement>(ASIDE_SELECTOR);
  const head = aside?.querySelector<HTMLElement>(HEAD_SELECTOR);
  if (!aside || !head) return () => undefined;
  const measure = () =>
    aside.style.setProperty(FAQ_HEAD_SIZE, `${head.getBoundingClientRect().height}px`);
  measure();
  const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
  observer?.observe(head);
  return () => {
    observer?.disconnect();
    aside.style.removeProperty(FAQ_HEAD_SIZE);
  };
}

export function FaqKeys({ listId }: { listId: string }): null {
  useEffect(() => {
    const list = document.getElementById(listId);
    if (list === null) return;
    const onKeyDown = (event: KeyboardEvent) => moveFaqFocus(list, event);
    const stopTracking = trackHeadSize(list);
    list.addEventListener("keydown", onKeyDown);
    list.setAttribute(FAQ_KEYS_ATTACHED, "");
    return () => {
      stopTracking();
      list.removeEventListener("keydown", onKeyDown);
      list.removeAttribute(FAQ_KEYS_ATTACHED);
    };
  }, [listId]);
  return null;
}
