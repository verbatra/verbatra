import { afterEach, describe, expect, it, vi } from "vitest";
import { msSinceFirstContentfulPaint } from "./first-paint";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("msSinceFirstContentfulPaint", () => {
  it("is null before the first contentful paint", () => {
    vi.spyOn(performance, "getEntriesByName").mockReturnValue([]);
    expect(msSinceFirstContentfulPaint()).toBeNull();
  });

  it("measures the time from the first contentful paint to now", () => {
    vi.spyOn(performance, "now").mockReturnValue(900);
    vi.spyOn(performance, "getEntriesByName").mockReturnValue([
      { name: "first-contentful-paint", startTime: 250 } as PerformanceEntry,
    ]);
    expect(msSinceFirstContentfulPaint()).toBe(650);
  });
});

describe("afterFirstContentfulPaint", () => {
  it("opens after its fallback delay when no paint entry ever arrives", async () => {
    vi.resetModules();
    vi.useFakeTimers();
    class SilentObserver {
      static supportedEntryTypes = ["paint"];
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal("PerformanceObserver", SilentObserver);
    const fresh = await import("./first-paint");
    let opened = false;
    void fresh.afterFirstContentfulPaint().then(() => {
      opened = true;
    });
    await vi.advanceTimersByTimeAsync(2999);
    expect(opened).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(opened).toBe(true);
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
});
