import { afterEach, describe, expect, it, vi } from "vitest";
import { prefersReducedMotion, subscribeReducedMotion } from "./reduced-motion";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubMedia(initial: boolean) {
  const state = { matches: initial, listeners: new Set<() => void>() };
  vi.stubGlobal("window", {
    matchMedia: (query: string) => {
      expect(query).toBe("(prefers-reduced-motion: reduce)");
      return {
        get matches() {
          return state.matches;
        },
        addEventListener: (_: string, listener: () => void) => state.listeners.add(listener),
        removeEventListener: (_: string, listener: () => void) => state.listeners.delete(listener),
      };
    },
  });
  return state;
}

describe("prefersReducedMotion", () => {
  it("is false without a window", () => {
    vi.stubGlobal("window", undefined);
    expect(prefersReducedMotion()).toBe(false);
  });

  it("reads the media query", () => {
    stubMedia(true);
    expect(prefersReducedMotion()).toBe(true);
  });
});

describe("subscribeReducedMotion", () => {
  it("reports each change and stops after unsubscribing", () => {
    const state = stubMedia(false);
    const seen: boolean[] = [];
    const stop = subscribeReducedMotion((reduced) => seen.push(reduced));
    state.matches = true;
    for (const listener of state.listeners) listener();
    expect(seen).toEqual([true]);
    stop();
    expect(state.listeners.size).toBe(0);
  });
});
