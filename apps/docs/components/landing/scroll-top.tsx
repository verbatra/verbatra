"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

const SMOOTH_SCROLL_QUERY = "(prefers-reduced-motion: no-preference)";

export function passedFirstViewport(
  entry: Pick<IntersectionObserverEntry, "boundingClientRect" | "isIntersecting">,
): boolean {
  return !entry.isIntersecting && entry.boundingClientRect.bottom <= 0;
}

export function scrollToTop(targetId: string, win: Window = window): void {
  const smooth = win.matchMedia(SMOOTH_SCROLL_QUERY).matches;
  win.scrollTo({ top: 0, behavior: smooth ? "smooth" : "instant" });
  win.document.getElementById(targetId)?.focus({ preventScroll: true });
}

export function ScrollTop({ label, targetId }: { label: string; targetId: string }): ReactNode {
  const sentinel = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = sentinel.current;
    if (node === null) return;
    const observer = new IntersectionObserver((entries) => {
      const entry = entries.at(-1);
      if (entry !== undefined) setVisible(passedFirstViewport(entry));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div ref={sentinel} aria-hidden="true" className="vk-scroll-top-sentinel" />
      {visible ? (
        <button
          type="button"
          className="vk-scroll-top"
          aria-label={label}
          onClick={() => scrollToTop(targetId)}
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
