// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HERO_DIFF_FILL_RATIO, HeroDiffMotion } from "./hero-diff-motion";

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
});

function mount(): HTMLElement {
  const host = document.createElement("div");
  act(() =>
    createRoot(host).render(
      <HeroDiffMotion>
        <span>diff</span>
      </HeroDiffMotion>,
    ),
  );
  return host;
}

function state(host: HTMLElement): string | null {
  return host.querySelector("[data-diff-state]")?.getAttribute("data-diff-state") ?? null;
}

function report(ratio: number): void {
  act(() => {
    for (const { callback, target } of watches) {
      if (!target) continue;
      callback(
        [
          {
            isIntersecting: ratio > 0,
            intersectionRatio: ratio,
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
    const host = mount();
    report(0.2);
    expect(state(host)).toBe("filled");
    expect(watches.every((watch) => watch.target === null)).toBe(true);
  });

  it("sets the missing state only while the diff is out of view, then fills it once in view", () => {
    const host = mount();
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

  it("never leaves the filled state under reduced motion", () => {
    stubReducedMotion(true);
    const host = mount();
    expect(watches).toHaveLength(0);
    expect(state(host)).toBe("filled");
  });
});
