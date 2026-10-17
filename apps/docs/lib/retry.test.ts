import { afterEach, describe, expect, it, vi } from "vitest";
import { RETRY_DELAYS_MS, retrying } from "./retry";

afterEach(() => {
  vi.useRealTimers();
});

describe("retrying", () => {
  it("returns the first success without waiting", async () => {
    const load = vi.fn(async () => "ok");
    await expect(retrying(load)).resolves.toBe("ok");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("waits each delay before the next attempt", async () => {
    vi.useFakeTimers();
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("first"))
      .mockRejectedValueOnce(new Error("second"))
      .mockResolvedValue("third");
    const result = retrying(load);
    await vi.advanceTimersByTimeAsync((RETRY_DELAYS_MS[0] ?? 0) - 1);
    expect(load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(load).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[1] ?? 0);
    await expect(result).resolves.toBe("third");
  });

  it("rejects with the last error once the delays run out", async () => {
    const load = vi.fn(() => Promise.reject(new Error("down")));
    await expect(retrying(load, [0])).rejects.toThrow("down");
    expect(load).toHaveBeenCalledTimes(2);
  });
});
