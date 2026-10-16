"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

const SMOOTH_SCROLL_QUERY = "(prefers-reduced-motion: no-preference)";

export function passedFirstViewport(
  entry: Pick<IntersectionObserverEntry, "boundingClientRect" | "isIntersecting">,
): boolean {
  return !entry.isIntersecting && entry.boundingClientRect.bottom <= 0;
}

export const STALL_FRAMES = 8;

export const MAX_SCROLL_RETRIES = 3;

export const MAX_WATCH_FRAMES = 360;

export const AWAY_FRAMES = 3;

const STOP_EVENTS = [
  "wheel",
  "touchstart",
  "keydown",
  "pointerdown",
  "pagehide",
  "popstate",
] as const;

type StopScroll = () => void;

const NOTHING_TO_STOP: StopScroll = () => {};

function keepScrollingToTop(win: Window): StopScroll {
  let retries = 0;
  let still = 0;
  let frames = 0;
  let away = 0;
  let last = win.scrollY;
  let frame = 0;
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    win.cancelAnimationFrame(frame);
    for (const type of STOP_EVENTS) win.removeEventListener(type, stop);
  };
  const check = () => {
    const y = win.scrollY;
    frames += 1;
    away = y > last ? away + 1 : 0;
    if (y <= 0 || away >= AWAY_FRAMES || frames >= MAX_WATCH_FRAMES) return stop();
    still = y === last ? still + 1 : 0;
    last = y;
    if (still >= STALL_FRAMES) {
      if (retries >= MAX_SCROLL_RETRIES) return stop();
      retries += 1;
      still = 0;
      win.scrollTo({ top: 0, behavior: "smooth" });
    }
    frame = win.requestAnimationFrame(check);
  };
  for (const type of STOP_EVENTS) win.addEventListener(type, stop, { passive: true });
  frame = win.requestAnimationFrame(check);
  return stop;
}

export function scrollToTop(targetId: string, win: Window = window): StopScroll {
  const smooth = win.matchMedia(SMOOTH_SCROLL_QUERY).matches;
  win.scrollTo({ top: 0, behavior: smooth ? "smooth" : "instant" });
  win.document.getElementById(targetId)?.focus({ preventScroll: true });
  return smooth ? keepScrollingToTop(win) : NOTHING_TO_STOP;
}

export function ScrollTop({ label, targetId }: { label: string; targetId: string }): ReactNode {
  const sentinel = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false);
  const stopScroll = useRef<StopScroll>(NOTHING_TO_STOP);

  useEffect(() => () => stopScroll.current(), []);

  useEffect(() => {
    const node = sentinel.current;
    if (node === null) return;
    node.dataset.active = "";
    const observer = new IntersectionObserver((entries) => {
      const entry = entries.at(-1);
      if (entry === undefined) return;
      const passed = passedFirstViewport(entry);
      if (!passed && button.current !== null && document.activeElement === button.current)
        document.getElementById(targetId)?.focus({ preventScroll: true });
      setVisible(passed);
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
      delete node.dataset.active;
    };
  }, [targetId]);

  return (
    <>
      <div ref={sentinel} aria-hidden="true" className="vk-scroll-top-sentinel" />
      {visible ? (
        <button
          ref={button}
          type="button"
          className="vk-scroll-top"
          aria-label={label}
          onClick={() => {
            stopScroll.current();
            stopScroll.current = scrollToTop(targetId);
          }}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m18 15-6-6-6 6" />
          </svg>
        </button>
      ) : null}
    </>
  );
}
