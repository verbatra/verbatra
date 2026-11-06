"use client";

import { type RefObject, useEffect, useLayoutEffect, useState } from "react";
import type { TooltipSide } from "./tooltip.tsx";

interface Box {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}

const BUBBLE_GAP_PX = 8;

const EDGE_PX = 4;

const WIDE_MAX_PX = 448;

const FLIPPED: Readonly<Record<TooltipSide, TooltipSide>> = {
  end: "end",
  bottom: "top",
  "bottom-start": "top-start",
  "bottom-end": "top",
  top: "top",
  "top-start": "bottom-start",
};

const FLIPPABLE: ReadonlySet<TooltipSide> = new Set<TooltipSide>([
  "bottom",
  "bottom-start",
  "bottom-end",
  "top-start",
]);

const ANCHOR: Readonly<Record<TooltipSide, "start" | "end" | "left">> = {
  end: "start",
  bottom: "left",
  "bottom-start": "start",
  "bottom-end": "end",
  top: "left",
  "top-start": "start",
};

function documentTop(): number {
  return Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
}

function clippingBox(element: HTMLElement): Box {
  let box: Box = {
    top: documentTop(),
    bottom: window.innerHeight,
    left: 0,
    right: window.innerWidth,
  };
  for (let node = element.parentElement; node !== null; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (style.overflowX !== "visible" || style.overflowY !== "visible") {
      const rect = node.getBoundingClientRect();
      box = {
        top: Math.max(box.top, rect.top),
        bottom: Math.min(box.bottom, rect.bottom),
        left: Math.max(box.left, rect.left),
        right: Math.min(box.right, rect.right),
      };
    }
  }
  return box;
}

function lacksRoom(side: TooltipSide, wrapper: HTMLElement, bubble: HTMLElement | null): boolean {
  if (bubble === null) {
    return false;
  }
  const box = clippingBox(wrapper);
  const rect = wrapper.getBoundingClientRect();
  const need = bubble.offsetHeight + BUBBLE_GAP_PX;
  return side === "top-start" ? rect.top - box.top < need : box.bottom - rect.bottom < need;
}

function fitBubble(
  wrapper: HTMLElement,
  slot: HTMLElement,
  bubble: HTMLElement,
  placement: TooltipSide,
  wide: boolean,
): void {
  slot.style.removeProperty("--tooltip-x");
  bubble.style.removeProperty("max-width");
  const box = clippingBox(wrapper);
  if (wide) {
    const room = box.right - box.left - 2 * EDGE_PX;
    bubble.style.setProperty("max-width", `${Math.min(WIDE_MAX_PX, room)}px`);
  }
  const rect = bubble.getBoundingClientRect();
  const shift =
    Math.max(0, box.left + EDGE_PX - rect.left) || Math.min(0, box.right - EDGE_PX - rect.right);
  const inline = getComputedStyle(slot).direction === "rtl" ? -1 : 1;
  const offset = { left: shift, start: inline * shift, end: -inline * shift }[ANCHOR[placement]];
  slot.style.setProperty("--tooltip-x", `${offset}px`);
}

export function useBubblePlacement({
  side,
  flip,
  wide,
  visible,
  label,
  wrapperRef,
  slotRef,
  bubbleRef,
}: {
  readonly side: TooltipSide;
  readonly flip: boolean;
  readonly wide: boolean | undefined;
  readonly visible: boolean;
  readonly label: string;
  readonly wrapperRef: RefObject<HTMLElement | null>;
  readonly slotRef: RefObject<HTMLElement | null>;
  readonly bubbleRef: RefObject<HTMLElement | null>;
}): { readonly placement: TooltipSide; remeasure(wrapper: HTMLElement): void } {
  const [flipped, setFlipped] = useState(false);
  const canFlip = flip && FLIPPABLE.has(side);
  const placement = canFlip && flipped ? FLIPPED[side] : side;

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (visible && canFlip && wrapper !== null) {
      setFlipped(lacksRoom(side, wrapper, bubbleRef.current));
    }
  }, [visible, canFlip, label, side, wrapperRef, bubbleRef]);

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    const slot = slotRef.current;
    const bubble = bubbleRef.current;
    if (wrapper === null || slot === null || bubble === null) {
      return;
    }
    if (visible) {
      fitBubble(wrapper, slot, bubble, placement, wide === true);
    } else {
      slot.style.removeProperty("--tooltip-x");
      bubble.style.removeProperty("max-width");
    }
  }, [visible, placement, label, wide, wrapperRef, slotRef, bubbleRef]);

  return {
    placement,
    remeasure: (wrapper) => setFlipped(canFlip && lacksRoom(side, wrapper, bubbleRef.current)),
  };
}
