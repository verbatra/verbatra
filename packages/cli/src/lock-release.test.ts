import { afterEach, describe, expect, it, vi } from "vitest";
import { releaseLocksWithin } from "./lock-release.js";

describe("releaseLocksWithin", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports released when the release settles before the deadline", async () => {
    vi.useFakeTimers();

    const outcome = releaseLocksWithin(() => Promise.resolve(), 5_000);

    await expect(outcome).resolves.toEqual({ status: "released" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reports failed with the error message when the release rejects", async () => {
    vi.useFakeTimers();

    const outcome = releaseLocksWithin(
      () => Promise.reject(new Error("EACCES: permission denied")),
      5_000,
    );

    await expect(outcome).resolves.toEqual({
      status: "failed",
      message: "EACCES: permission denied",
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reports failed for a rejection that is not an Error", async () => {
    const outcome = releaseLocksWithin(() => Promise.reject("disk gone"), 5_000);

    await expect(outcome).resolves.toEqual({ status: "failed", message: "disk gone" });
  });

  it("reports timed-out when the release has not settled by the deadline", async () => {
    vi.useFakeTimers();
    let finish: () => void = () => undefined;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });

    const outcome = releaseLocksWithin(() => pending, 5_000);
    await vi.advanceTimersByTimeAsync(5_000);
    finish();

    await expect(outcome).resolves.toEqual({ status: "timed-out", deadlineMs: 5_000 });
  });
});
