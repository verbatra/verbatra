import { afterEach, describe, expect, it, vi } from "vitest";
import { within } from "./within";

afterEach(() => {
  vi.useRealTimers();
});

function never(): Promise<string> {
  return new Promise(() => undefined);
}

describe("within", () => {
  it("resolves with the value when the promise settles before the deadline", async () => {
    vi.useFakeTimers();
    const result = within(Promise.resolve("loaded"), 800, null);
    await vi.advanceTimersByTimeAsync(0);
    await expect(result).resolves.toBe("loaded");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("waits the whole deadline, and not a millisecond less, before giving the fallback", async () => {
    vi.useFakeTimers();
    let settled: string | null | undefined;
    void within(never(), 800, null).then((value) => {
      settled = value;
    });
    await vi.advanceTimersByTimeAsync(799);
    expect(settled).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBeNull();
  });

  it("gives the fallback at once when the promise rejects", async () => {
    vi.useFakeTimers();
    const result = within(Promise.reject(new Error("chunk failed")), 800, "fallback");
    await vi.advanceTimersByTimeAsync(0);
    await expect(result).resolves.toBe("fallback");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps the first outcome when the promise settles after the deadline", async () => {
    vi.useFakeTimers();
    let release: (value: string) => void = () => undefined;
    const late = new Promise<string>((resolve) => {
      release = resolve;
    });
    const result = within(late, 800, null);
    await vi.advanceTimersByTimeAsync(800);
    release("late");
    await expect(result).resolves.toBeNull();
  });
});
