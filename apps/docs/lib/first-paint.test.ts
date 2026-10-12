import { describe, expect, it, vi } from "vitest";

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
