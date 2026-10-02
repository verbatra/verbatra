import type { ProgressEvent } from "@verbatra/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProgressReporter, type ProgressUpdate } from "./progress-reporter.js";

function planned(locale: string, batches: number): ProgressEvent {
  return { type: "locale-planned", locale, keys: batches * 10, batches, cacheHits: 0 };
}

function finished(locale: string, batchIndex: number, totalBatches: number): ProgressEvent {
  return { type: "batch-finished", locale, batchIndex, totalBatches, durationMs: 1 };
}

function recorder(): {
  readonly updates: ProgressUpdate[];
  readonly send: (update: ProgressUpdate) => Promise<void>;
} {
  const updates: ProgressUpdate[] = [];
  return {
    updates,
    send: async (update) => {
      updates.push(update);
    },
  };
}

describe("createProgressReporter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("sends the first finished batch at once with the planned total and a locale message", () => {
    const { updates, send } = recorder();
    const reporter = createProgressReporter({ send });

    reporter.onProgress(planned("de", 3));
    reporter.onProgress(finished("de", 1, 3));

    expect(updates).toEqual([{ progress: 1, total: 3, message: "de: batch 1/3" }]);
  });

  it("holds batches finished within the interval and sends the latest one when it ends", () => {
    const { updates, send } = recorder();
    const reporter = createProgressReporter({ send, minIntervalMs: 250 });

    reporter.onProgress(planned("de", 3));
    reporter.onProgress(finished("de", 1, 3));
    reporter.onProgress(finished("de", 2, 3));
    reporter.onProgress(finished("de", 3, 3));
    expect(updates).toHaveLength(1);

    vi.advanceTimersByTime(250);

    expect(updates).toEqual([
      { progress: 1, total: 3, message: "de: batch 1/3" },
      { progress: 3, total: 3, message: "de: batch 3/3" },
    ]);
  });

  it("sends at once again after the interval has passed", () => {
    const { updates, send } = recorder();
    const reporter = createProgressReporter({ send, minIntervalMs: 250 });

    reporter.onProgress(planned("de", 2));
    reporter.onProgress(finished("de", 1, 2));
    vi.advanceTimersByTime(300);
    reporter.onProgress(finished("de", 2, 2));

    expect(updates.map((update) => update.progress)).toEqual([1, 2]);
  });

  it("grows the total as each locale is planned", () => {
    const { updates, send } = recorder();
    const reporter = createProgressReporter({ send, minIntervalMs: 0 });

    reporter.onProgress(planned("de", 1));
    reporter.onProgress(finished("de", 1, 1));
    reporter.onProgress(planned("fr", 2));
    reporter.onProgress(finished("fr", 1, 2));
    reporter.onProgress(finished("fr", 2, 2));

    expect(updates).toEqual([
      { progress: 1, total: 1, message: "de: batch 1/1" },
      { progress: 2, total: 3, message: "fr: batch 1/2" },
      { progress: 3, total: 3, message: "fr: batch 2/2" },
    ]);
  });

  it("never reports a total below the progress", () => {
    const { updates, send } = recorder();
    const reporter = createProgressReporter({ send });

    reporter.onProgress(finished("de", 1, 1));

    expect(updates).toEqual([{ progress: 1, total: 1, message: "de: batch 1/1" }]);
  });

  it("ignores every other progress event", () => {
    const { updates, send } = recorder();
    const reporter = createProgressReporter({ send });

    reporter.onProgress({ type: "sub-batch", locale: "de", batchIndex: 1, totalBatches: 1 });
    reporter.onProgress({ type: "writing", locale: "de" });
    reporter.onProgress({ type: "run-finished", localesCompleted: 1 });
    reporter.close();

    expect(updates).toEqual([]);
  });

  it("flushes a held update on close and sends nothing afterwards", () => {
    const { updates, send } = recorder();
    const reporter = createProgressReporter({ send, minIntervalMs: 250 });

    reporter.onProgress(planned("de", 2));
    reporter.onProgress(finished("de", 1, 2));
    reporter.onProgress(finished("de", 2, 2));
    expect(vi.getTimerCount()).toBe(1);
    reporter.close();
    expect(vi.getTimerCount()).toBe(0);
    reporter.onProgress(finished("de", 2, 2));
    reporter.close();
    vi.advanceTimersByTime(1000);

    expect(vi.getTimerCount()).toBe(0);
    expect(updates.map((update) => update.progress)).toEqual([1, 2]);
  });

  it("unrefs the trailing timer so it never keeps the process alive", () => {
    const unref = vi.fn();
    const fakeSetTimeout = globalThis.setTimeout;
    const spy = vi.spyOn(globalThis, "setTimeout").mockImplementation(((
      handler: () => void,
      delay?: number,
    ) => {
      const handle = fakeSetTimeout(handler, delay);
      return Object.assign(handle, { unref: () => unref() });
    }) as unknown as typeof setTimeout);
    const { send } = recorder();
    const reporter = createProgressReporter({ send, minIntervalMs: 250 });

    reporter.onProgress(finished("de", 1, 2));
    reporter.onProgress(finished("de", 2, 2));
    reporter.close();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(unref).toHaveBeenCalledTimes(1);
  });

  it("logs a rejected send without throwing into the run", async () => {
    const lines: string[] = [];
    const reporter = createProgressReporter({
      send: () => Promise.reject(new Error("transport closed")),
      onLog: (line) => lines.push(line),
    });

    expect(() => reporter.onProgress(finished("de", 1, 1))).not.toThrow();
    await vi.runAllTimersAsync();

    expect(lines).toEqual(["Sending a progress notification failed: Error: transport closed"]);
  });

  it("logs a send that throws synchronously without throwing into the run", () => {
    const lines: string[] = [];
    const reporter = createProgressReporter({
      send: () => {
        throw new Error("not connected");
      },
      onLog: (line) => lines.push(line),
    });

    expect(() => reporter.onProgress(finished("de", 1, 1))).not.toThrow();

    expect(lines).toEqual(["Sending a progress notification failed: Error: not connected"]);
  });

  it("swallows a failed send when no log sink is given", async () => {
    const reporter = createProgressReporter({
      send: () => Promise.reject(new Error("transport closed")),
    });

    expect(() => reporter.onProgress(finished("de", 1, 1))).not.toThrow();
    await vi.runAllTimersAsync();
  });
});
