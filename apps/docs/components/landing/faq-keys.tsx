"use client";

import { useEffect } from "react";

const QUESTION_SELECTOR = "[data-faq] > summary";

export const FAQ_KEYS_ATTACHED = "data-faq-keys";

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

export function FaqKeys({ listId }: { listId: string }): null {
  useEffect(() => {
    const list = document.getElementById(listId);
    if (list === null) return;
    const onKeyDown = (event: KeyboardEvent) => moveFaqFocus(list, event);
    list.addEventListener("keydown", onKeyDown);
    list.setAttribute(FAQ_KEYS_ATTACHED, "");
    return () => {
      list.removeEventListener("keydown", onKeyDown);
      list.removeAttribute(FAQ_KEYS_ATTACHED);
    };
  }, [listId]);
  return null;
}
