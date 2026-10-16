// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  HERO_DIFF_FILL_RATIO,
  HERO_DIFF_FILL_TIMEOUT_MS,
  HERO_DIFF_FILL_VIEWPORT_SHARE,
  HeroDiffMotion,
} from "./hero-diff-motion";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Watch = { callback: IntersectionObserverCallback; target: Element | null };
const watches: Watch[] = [];

class FakeObserver {
  readonly watch: Watch;
  constructor(callback: IntersectionObserverCallback) {
    this.watch = { callback, target: null };
    watches.push(this.watch);
  }
  observe(target: Element): void {
    this.watch.target = target;
  }
  disconnect(): void {
    this.watch.target = null;
  }
}

function stubReducedMotion(reduce: boolean): void {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduce && query.includes("reduce"),
    media: query,
  }));
}

beforeEach(() => {
  watches.length = 0;
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  stubReducedMotion(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const VIEWPORT = 256;

function mount(): { host: HTMLElement; unmount: () => void } {
  const host = document.createElement("div");
  const root = createRoot(host);
  act(() =>
    root.render(
      <HeroDiffMotion>
        <span>diff</span>
      </HeroDiffMotion>,
    ),
  );
  return { host, unmount: () => act(() => root.unmount()) };
}

function state(host: HTMLElement): string | null {
  return host.querySelector("[data-diff-state]")?.getAttribute("data-diff-state") ?? null;
}

function report(
  ratio: number,
  visibleHeight = 0,
  rootBounds: DOMRectReadOnly | null = { height: VIEWPORT } as DOMRectReadOnly,
): void {
  act(() => {
    for (const { callback, target } of watches) {
      if (!target) continue;
      callback(
        [
          {
            isIntersecting: ratio > 0,
            intersectionRatio: ratio,
            intersectionRect: { height: visibleHeight } as DOMRectReadOnly,
            rootBounds,
            target,
          } as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver,
      );
    }
  });
}

describe("HeroDiffMotion", () => {
  it("keeps the filled state when the diff is already in view after hydration", () => {
    const { host } = mount();
    report(0.2);
    expect(state(host)).toBe("filled");
    expect(watches.every((watch) => watch.target === null)).toBe(true);
  });

  it("sets the missing state only while the diff is out of view, then fills it once in view", () => {
    const { host } = mount();
    expect(state(host)).toBe("filled");
    report(0);
    expect(state(host)).toBe("missing");
    report(HERO_DIFF_FILL_RATIO / 2);
    expect(state(host)).toBe("missing");
    report(HERO_DIFF_FILL_RATIO);
    expect(state(host)).toBe("filled");
    report(0);
    expect(state(host)).toBe("filled");
  });

  it("fills a diff taller than a short viewport once it covers enough of the viewport", () => {
    const { host } = mount();
    report(0);
    const share = VIEWPORT * HERO_DIFF_FILL_VIEWPORT_SHARE;
    report(0.1, share - 1);
    expect(state(host)).toBe("missing");
    report(0.15, share);
    expect(state(host)).toBe("filled");
  });

  it("falls back to the window height when the observer reports no root bounds", () => {
    vi.stubGlobal("innerHeight", VIEWPORT);
    const { host } = mount();
    report(0);
    report(0.1, VIEWPORT * HERO_DIFF_FILL_VIEWPORT_SHARE - 1, null);
    expect(state(host)).toBe("missing");
    report(0.15, VIEWPORT * HERO_DIFF_FILL_VIEWPORT_SHARE, null);
    expect(state(host)).toBe("filled");
  });

  it("fills once a timeout passes after any part of the diff enters view", () => {
    vi.useFakeTimers();
    const { host } = mount();
    report(0);
    report(0.05, 1);
    expect(state(host)).toBe("missing");
    report(0.1, 2);
    act(() => vi.advanceTimersByTime(HERO_DIFF_FILL_TIMEOUT_MS - 1));
    expect(state(host)).toBe("missing");
    act(() => vi.advanceTimersByTime(1));
    expect(state(host)).toBe("filled");
    expect(watches.every((watch) => watch.target === null)).toBe(true);
  });

  it("clears the pending timeout when it unmounts", () => {
    vi.useFakeTimers();
    const { unmount } = mount();
    report(0);
    report(0.05, 1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("never leaves the filled state under reduced motion", () => {
    stubReducedMotion(true);
    const { host } = mount();
    expect(watches).toHaveLength(0);
    expect(state(host)).toBe("filled");
  });
});
