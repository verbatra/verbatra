import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { classifyProviderError } from "./error-classification.js";
import { ProviderError } from "./errors.js";
import {
  DEFAULT_REQUEST_TIMEOUT_MS,
  raceAttemptTimeout,
  withRequestTimeout,
  withSdkAttemptTimeout,
} from "./request-timeout.js";

class StatusError extends Error {
  readonly status: number;
  constructor(status: number) {
    super("upstream detail that must never surface");
    this.status = status;
  }
}

function abortableHang(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    signal.addEventListener(
      "abort",
      () => reject(new DOMException("This operation was aborted.", "AbortError")),
      { once: true },
    );
  });
}

describe("withRequestTimeout: within the bound", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("resolves with the call's value when it settles before the timeout", async () => {
    await expect(
      withRequestTimeout(DEFAULT_REQUEST_TIMEOUT_MS, undefined, () => Promise.resolve("ok")),
    ).resolves.toBe("ok");
  });

  it("classifies a non-abort SDK failure through the guard, never mislabeling it TIMEOUT", async () => {
    const error = await withRequestTimeout(10_000, undefined, () =>
      Promise.reject(new StatusError(429)),
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).code).toBe("RATE_LIMITED");
  });
});

describe("withRequestTimeout: timeout", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("rejects with a retriable TIMEOUT ProviderError naming the duration when the timeout elapses first", async () => {
    const rejection = withRequestTimeout(
      30_000,
      undefined,
      () => new Promise<never>(() => {}),
    ).catch((caught: unknown) => caught);
    await vi.advanceTimersByTimeAsync(30_000);
    const error = await rejection;
    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).code).toBe("TIMEOUT");
    expect((error as ProviderError).message).toContain("30000");
  });

  it("aborts the composed signal on timeout so a signal-aware call is really cancelled", async () => {
    let captured: AbortSignal | undefined;
    const rejection = withRequestTimeout(1000, undefined, (signal) => {
      captured = signal;
      return abortableHang(signal);
    }).catch((caught: unknown) => caught);
    await vi.advanceTimersByTimeAsync(1000);
    const error = await rejection;
    expect(captured?.aborted).toBe(true);
    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).code).toBe("TIMEOUT");
  });

  it("bounds a signal-ignoring call, rejecting on timeout even though the call never settles", async () => {
    const call = vi.fn(() => new Promise<never>(() => {}));
    const rejection = withRequestTimeout(2000, undefined, call).catch((caught: unknown) => caught);
    await vi.advanceTimersByTimeAsync(2000);
    const error = await rejection;
    expect(call).toHaveBeenCalledTimes(1);
    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).code).toBe("TIMEOUT");
  });

  it("never leaks a key or credential in the timeout error, even when the raced-away call later fails with one", async () => {
    const rejection = withRequestTimeout(
      1000,
      undefined,
      (signal) =>
        new Promise<never>((_, reject) => {
          signal.addEventListener(
            "abort",
            () => reject(new Error("x-api-key: sk-SECRET Authorization: Bearer sk-SECRET")),
            { once: true },
          );
        }),
    ).catch((caught: unknown) => caught);
    await vi.advanceTimersByTimeAsync(1000);
    const error = await rejection;
    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).code).toBe("TIMEOUT");
    const text = `${(error as ProviderError).message} ${(error as ProviderError).stack ?? ""}`;
    expect(text).not.toContain("sk-SECRET");
    expect(text).not.toContain("Bearer");
    expect(text).not.toContain("x-api-key");
  });
});

describe("withRequestTimeout: caller cancellation", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("re-throws a genuine caller abort unwrapped, not as a TIMEOUT", async () => {
    const controller = new AbortController();
    const sentinel = new DOMException("This operation was aborted.", "AbortError");
    const caught = await withRequestTimeout(10_000, controller.signal, () => {
      controller.abort();
      return Promise.reject(sentinel);
    }).catch((error: unknown) => error);
    expect(caught).toBe(sentinel);
  });

  it("short-circuits without calling when the caller signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const call = vi.fn(() => Promise.resolve("unreachable"));
    const caught = await withRequestTimeout(10_000, controller.signal, call).catch(
      (error: unknown) => error,
    );
    expect(call).not.toHaveBeenCalled();
    expect(caught).not.toBeInstanceOf(ProviderError);
  });
});

describe("withRequestTimeout: TIMEOUT is a retriable classification", () => {
  it("maps a request-timeout status to TIMEOUT, distinct from the terminal AUTH_FAILED", () => {
    expect(classifyProviderError(new StatusError(408))).toBe("TIMEOUT");
    expect(classifyProviderError(new StatusError(401))).toBe("AUTH_FAILED");
  });
});

describe("raceAttemptTimeout: one attempt", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("passes the attempt's own failure through unclassified so a retry loop can read its status", async () => {
    const raw = new StatusError(503);
    await expect(raceAttemptTimeout(1000, undefined, () => Promise.reject(raw))).rejects.toBe(raw);
  });

  it("rejects with a TIMEOUT ProviderError when the attempt outlives the bound", async () => {
    const rejection = raceAttemptTimeout(1000, undefined, () => new Promise<never>(() => {})).catch(
      (caught: unknown) => caught,
    );
    await vi.advanceTimersByTimeAsync(1000);
    expect(await rejection).toMatchObject({ code: "TIMEOUT" });
  });
});

describe("withSdkAttemptTimeout: the SDK enforces the bound per attempt", () => {
  class APIConnectionTimeoutError extends Error {}

  it("hands the timeout to the call and omits the signal when the caller has none", async () => {
    const call = vi.fn(() => Promise.resolve("ok"));
    await expect(withSdkAttemptTimeout(3000, undefined, call)).resolves.toBe("ok");
    expect(call).toHaveBeenCalledWith({ timeout: 3000 });
  });

  it("hands the caller signal next to the timeout", async () => {
    const controller = new AbortController();
    const call = vi.fn(() => Promise.resolve("ok"));
    await withSdkAttemptTimeout(3000, controller.signal, call);
    expect(call).toHaveBeenCalledWith({ signal: controller.signal, timeout: 3000 });
  });

  it("names the configured bound when the SDK reports an attempt timeout", async () => {
    const error = await withSdkAttemptTimeout(3000, undefined, () =>
      Promise.reject(new APIConnectionTimeoutError("Request timed out.")),
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).code).toBe("TIMEOUT");
    expect((error as ProviderError).message).toContain("3000");
  });

  it.each([
    [429, "RATE_LIMITED"],
    [500, "PROVIDER_UNAVAILABLE"],
  ])("reports the final %i after the SDK's retries as %s", async (status, code) => {
    const error = await withSdkAttemptTimeout(1, undefined, () =>
      Promise.reject(new StatusError(status)),
    ).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code });
  });
});
