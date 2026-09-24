import { describe, expect, it, vi } from "vitest";
import { ProviderError } from "../errors.js";
import { guardProviderCall } from "../guard.js";
import { withGeminiRetry } from "./retry.js";

class ApiError extends Error {
  readonly status: number;
  constructor(status: number) {
    super("upstream detail");
    this.status = status;
  }
}

const FAST = { attempts: 3, baseDelayMs: 1 };

describe("withGeminiRetry: success paths", () => {
  it("returns the first attempt's value without retrying", async () => {
    const call = vi.fn(async () => "ok");
    await expect(withGeminiRetry(call, undefined, FAST)).resolves.toBe("ok");
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("retries a transient 429 and returns the eventual success", async () => {
    const call = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new ApiError(429))
      .mockResolvedValueOnce("ok");
    await expect(withGeminiRetry(call, undefined, FAST)).resolves.toBe("ok");
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("retries a transient 503 and returns the eventual success", async () => {
    const call = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new ApiError(503))
      .mockResolvedValueOnce("ok");
    await expect(withGeminiRetry(call, undefined, FAST)).resolves.toBe("ok");
    expect(call).toHaveBeenCalledTimes(2);
  });
});

describe("withGeminiRetry: retry listener", () => {
  it("reports each retry with its attempt, delay and status before waiting", async () => {
    const retries: unknown[] = [];
    const call = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new ApiError(429))
      .mockRejectedValueOnce(new ApiError(503))
      .mockResolvedValueOnce("ok");

    await expect(
      withGeminiRetry(call, undefined, { attempts: 3, baseDelayMs: 2 }, (retry) =>
        retries.push(retry),
      ),
    ).resolves.toBe("ok");
    expect(retries).toEqual([
      { attempt: 2, delayMs: 2, status: 429 },
      { attempt: 3, delayMs: 4, status: 503 },
    ]);
  });

  it("never reports a failure it does not retry", async () => {
    const retries: unknown[] = [];
    const call = vi.fn<() => Promise<string>>().mockRejectedValue(new ApiError(400));

    await expect(
      withGeminiRetry(call, undefined, FAST, (retry) => retries.push(retry)),
    ).rejects.toThrow();
    expect(retries).toEqual([]);
  });
});

describe("withGeminiRetry: exhaustion", () => {
  it("throws the last attempt's raw error, unwrapped, once attempts are exhausted", async () => {
    const errors = [new ApiError(429), new ApiError(429), new ApiError(429)];
    let index = 0;
    const call = vi.fn(() => {
      const error = errors[index] ?? errors[2];
      index += 1;
      return Promise.reject(error);
    });
    await expect(withGeminiRetry(call, undefined, FAST)).rejects.toBe(errors[2]);
    expect(call).toHaveBeenCalledTimes(3);
  });

  it("makes exactly `attempts` calls, never one more", async () => {
    const call = vi.fn(() => Promise.reject(new ApiError(500)));
    await expect(
      withGeminiRetry(call, undefined, { attempts: 2, baseDelayMs: 1 }),
    ).rejects.toThrow();
    expect(call).toHaveBeenCalledTimes(2);
  });
});

describe("withGeminiRetry: non-retryable errors stop immediately", () => {
  it("does not retry a 401 (AUTH_FAILED-shaped)", async () => {
    const sentinel = new ApiError(401);
    const call = vi.fn(() => Promise.reject(sentinel));
    await expect(withGeminiRetry(call, undefined, FAST)).rejects.toBe(sentinel);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("does not retry a status-less error", async () => {
    const sentinel = new Error("network failure, no status");
    const call = vi.fn(() => Promise.reject(sentinel));
    await expect(withGeminiRetry(call, undefined, FAST)).rejects.toBe(sentinel);
    expect(call).toHaveBeenCalledTimes(1);
  });
});

describe("withGeminiRetry: cancellation", () => {
  it("stops retrying once the signal is already aborted, and throws an abort-shaped error instead of the retryable one", async () => {
    const controller = new AbortController();
    const sentinel = new ApiError(429);
    const call = vi.fn(() => {
      controller.abort();
      return Promise.reject(sentinel);
    });
    const rejection = await withGeminiRetry(call, controller.signal, FAST).catch(
      (error: unknown) => error,
    );
    expect(rejection).not.toBe(sentinel);
    expect(rejection).toBeInstanceOf(DOMException);
    expect((rejection as DOMException).name).toBe("AbortError");
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("does not retry once the signal aborts mid-delay, and surfaces an abort instead of the retryable error the wait interrupted", async () => {
    const controller = new AbortController();
    const sentinel = new ApiError(429);
    const call = vi.fn<() => Promise<string>>().mockRejectedValueOnce(sentinel);
    const promise = withGeminiRetry(call, controller.signal, { attempts: 3, baseDelayMs: 60_000 });
    queueMicrotask(() => controller.abort());
    const rejection = await promise.catch((error: unknown) => error);
    expect(rejection).not.toBe(sentinel);
    expect(rejection).toBeInstanceOf(DOMException);
    expect((rejection as DOMException).name).toBe("AbortError");
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("throws the signal's own abort reason when one was supplied, not a generic AbortError", async () => {
    const controller = new AbortController();
    const reason = new Error("cancelled by orchestrator");
    const call = vi.fn(() => {
      controller.abort(reason);
      return Promise.reject(new ApiError(429));
    });
    await expect(withGeminiRetry(call, controller.signal, FAST)).rejects.toBe(reason);
  });
});

describe("withGeminiRetry: composed with guardProviderCall (regression, mirrors production wiring)", () => {
  it("classifies a genuine abort during Gemini's backoff as an abort, not RATE_LIMITED, once composed with the shared guard", async () => {
    const controller = new AbortController();
    const call = vi.fn(() => {
      controller.abort();
      return Promise.reject(new ApiError(429));
    });
    const guarded = () => withGeminiRetry(call, controller.signal, FAST);
    const rejection = await guardProviderCall(guarded, controller.signal).catch(
      (error: unknown) => error,
    );
    expect(rejection).not.toBeInstanceOf(ProviderError);
    expect(rejection).toBeInstanceOf(DOMException);
    expect((rejection as DOMException).name).toBe("AbortError");
  });
});

describe("withGeminiRetry: backoff timing", () => {
  it("doubles the delay on each successive retry", async () => {
    vi.useFakeTimers();
    try {
      const call = vi
        .fn<() => Promise<string>>()
        .mockRejectedValueOnce(new ApiError(429))
        .mockRejectedValueOnce(new ApiError(429))
        .mockResolvedValueOnce("ok");
      const promise = withGeminiRetry(call, undefined, { attempts: 3, baseDelayMs: 100 });
      await vi.advanceTimersByTimeAsync(0);
      expect(call).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(99);
      expect(call).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(call).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(199);
      expect(call).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1);
      expect(call).toHaveBeenCalledTimes(3);
      await expect(promise).resolves.toBe("ok");
    } finally {
      vi.useRealTimers();
    }
  });
});
