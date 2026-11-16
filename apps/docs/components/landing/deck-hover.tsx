"use client";

import { useEffect } from "react";

const ROW_SELECTOR = ".vk-deck-row";
const RADIO_SELECTOR = ".vk-deck-radio";
const FINE_POINTER = "(hover: hover) and (pointer: fine)";
const WIDE = "(min-width: 64rem)";

export const DECK_HOVER_ATTACHED = "data-deck-hover";
export const DECK_HOVER_DWELL_MS = 120;

function rowOf(target: EventTarget | null): Element | null {
  return target instanceof Element ? target.closest(ROW_SELECTOR) : null;
}

function select(row: Element): void {
  const radio = row.querySelector<HTMLInputElement>(RADIO_SELECTOR);
  if (radio === null || radio.checked) return;
  radio.checked = true;
  radio.dispatchEvent(new Event("change", { bubbles: true }));
}

function attach(deck: HTMLElement): () => void {
  let timer: number | undefined;
  let armedRow: Element | null = null;
  let lastX = Number.NaN;
  let lastY = Number.NaN;

  const cancel = () => {
    window.clearTimeout(timer);
    timer = undefined;
    armedRow = null;
  };

  const keyboardHasFocus = () =>
    Array.from(deck.querySelectorAll(RADIO_SELECTOR)).some((radio) =>
      radio.matches(":focus-visible"),
    );

  const onMove = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    const moved = event.clientX !== lastX || event.clientY !== lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    if (!moved) return;
    const row = rowOf(event.target);
    if (row === null) {
      cancel();
      return;
    }
    if (row === armedRow) return;
    cancel();
    armedRow = row;
    timer = window.setTimeout(() => {
      const target = armedRow;
      cancel();
      if (target !== null && !keyboardHasFocus()) select(target);
    }, DECK_HOVER_DWELL_MS);
  };

  const onOut = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    const row = rowOf(event.target);
    if (row !== null && row === armedRow) cancel();
  };

  deck.addEventListener("pointermove", onMove);
  deck.addEventListener("pointerout", onOut);
  deck.addEventListener("pointerleave", cancel);
  deck.setAttribute(DECK_HOVER_ATTACHED, "");
  return () => {
    cancel();
    deck.removeEventListener("pointermove", onMove);
    deck.removeEventListener("pointerout", onOut);
    deck.removeEventListener("pointerleave", cancel);
    deck.removeAttribute(DECK_HOVER_ATTACHED);
  };
}

export function DeckHover({ deckId }: { deckId: string }): null {
  useEffect(() => {
    const deck = document.getElementById(deckId);
    if (deck === null) return;
    const fine = window.matchMedia(FINE_POINTER);
    const wide = window.matchMedia(WIDE);
    let detach: (() => void) | undefined;
    const sync = () => {
      const active = fine.matches && wide.matches;
      if (active && detach === undefined) detach = attach(deck);
      if (!active && detach !== undefined) {
        detach();
        detach = undefined;
      }
    };
    sync();
    fine.addEventListener("change", sync);
    wide.addEventListener("change", sync);
    return () => {
      fine.removeEventListener("change", sync);
      wide.removeEventListener("change", sync);
      detach?.();
    };
  }, [deckId]);
  return null;
}
