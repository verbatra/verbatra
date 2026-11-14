"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import Button from "@/components/ui/button";
import { MARQUEE_COPIES } from "@/lib/marquee-copies";

export type MarqueeState = "running" | "paused";

const GLYPH = {
  width: 14,
  height: 14,
  viewBox: "0 0 24 24",
  fill: "currentColor",
} as const;

const MOTION_QUERY = "(prefers-reduced-motion: no-preference)";

const TRACK_LIST_SELECTOR = ".vk-marquee-track > .vk-marquee-list";

function addCopies(root: HTMLElement): ReadonlyArray<HTMLElement> {
  return Array.from(root.querySelectorAll<HTMLElement>(TRACK_LIST_SELECTOR)).flatMap((list) =>
    Array.from({ length: MARQUEE_COPIES }, () => {
      const copy = list.cloneNode(true) as HTMLElement;
      copy.removeAttribute("aria-labelledby");
      copy.setAttribute("aria-hidden", "true");
      copy.setAttribute("inert", "");
      copy.classList.add("vk-marquee-copy");
      list.parentElement?.append(copy);
      return copy;
    }),
  );
}

function alignTo(reference: Animation, animation: Animation): void {
  if (reference.startTime !== null) animation.startTime = reference.startTime;
  else if (reference.currentTime !== null) animation.currentTime = reference.currentTime;
}

async function alignCopies(root: HTMLElement): Promise<void> {
  for (const track of root.querySelectorAll(".vk-marquee-track")) {
    const [first] = track.querySelectorAll<HTMLElement>(":scope > .vk-marquee-list");
    const reference = first?.getAnimations?.()[0];
    if (reference === undefined) continue;
    const copies = Array.from(
      track.querySelectorAll<HTMLElement>(":scope > .vk-marquee-copy"),
    ).flatMap((copy) => copy.getAnimations?.() ?? []);
    await Promise.all([reference.ready, ...copies.map((animation) => animation.ready)]);
    for (const animation of copies) alignTo(reference, animation);
  }
}

function alignOnceStarted(root: HTMLElement): () => void {
  let frame = requestAnimationFrame(() => {
    frame = requestAnimationFrame(() => void alignCopies(root));
  });
  return () => cancelAnimationFrame(frame);
}

export function MarqueeMotion({
  pauseLabel,
  playLabel,
  children,
}: {
  pauseLabel: string;
  playLabel: string;
  children: ReactNode;
}): ReactNode {
  const root = useRef<HTMLDivElement>(null);
  const [moving, setMoving] = useState(false);
  const [paused, setPaused] = useState(false);
  const state: MarqueeState = paused ? "paused" : "running";

  // biome-ignore lint/correctness/useExhaustiveDependencies: a refresh sends new rows, so the copies are cloned again from them
  useEffect(() => {
    const element = root.current;
    if (element === null) return;
    const query = window.matchMedia(MOTION_QUERY);
    let copies: ReadonlyArray<HTMLElement> = [];
    let cancelAlign = () => {};
    const sync = () => {
      cancelAlign();
      for (const copy of copies) copy.remove();
      copies = query.matches ? addCopies(element) : [];
      cancelAlign = alignOnceStarted(element);
      setMoving(query.matches);
    };
    sync();
    query.addEventListener("change", sync);
    return () => {
      query.removeEventListener("change", sync);
      cancelAlign();
      for (const copy of copies) copy.remove();
    };
  }, [children]);

  return (
    <div ref={root} className="vk-marquee" data-marquee={moving ? state : undefined}>
      <Button
        variant="ghost"
        size="md"
        className="vk-marquee-toggle"
        onClick={() => setPaused((current) => !current)}
      >
        <svg {...GLYPH} aria-hidden="true" className="vk-marquee-glyph-pause">
          <path d="M7 5h3v14H7zM14 5h3v14h-3z" />
        </svg>
        <svg {...GLYPH} aria-hidden="true" className="vk-marquee-glyph-play">
          <path d="M8 5v14l11-7z" />
        </svg>
        {paused ? playLabel : pauseLabel}
      </Button>
      {children}
    </div>
  );
}
