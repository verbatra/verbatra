// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useInView } from "@/lib/use-in-view";

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

beforeEach(() => {
  watches.length = 0;
  vi.stubGlobal("IntersectionObserver", FakeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function mount(once: boolean): { seen: boolean[] } {
  const record = { seen: [] as boolean[] };
  function Probe() {
    const [ref, inView] = useInView<HTMLDivElement>(0.4, { once });
    record.seen.push(inView);
    return <div ref={ref} />;
  }
  act(() => createRoot(document.createElement("div")).render(<Probe />));
  return record;
}

function report(...visible: boolean[]): void {
  act(() => {
    for (const { callback, target } of watches) {
      if (!target) continue;
      callback(
        visible.map((isIntersecting) => ({ isIntersecting, target }) as IntersectionObserverEntry),
        {} as IntersectionObserver,
      );
    }
  });
}

describe("useInView", () => {
  it("follows the node in and out of view by default", () => {
    const record = mount(false);
    report(true);
    report(false);
    expect(record.seen.at(-1)).toBe(false);
    expect(record.seen).toContain(true);
  });

  it("stays in view and stops observing once seen when asked to", () => {
    const record = mount(true);
    report(false);
    expect(record.seen.at(-1)).toBe(false);
    report(false, true);
    expect(record.seen.at(-1)).toBe(true);
    expect(watches.every((watch) => watch.target === null)).toBe(true);
  });

  it("ignores an empty batch of entries", () => {
    const record = mount(false);
    report();
    expect(record.seen.at(-1)).toBe(false);
  });
});
