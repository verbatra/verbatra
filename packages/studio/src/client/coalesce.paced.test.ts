import { describe, expect, it, vi } from "vitest";
import { createPacedRunner } from "./coalesce.js";

function setup(minGapMs = 1500) {
  vi.useFakeTimers();
  let clock = 0;
  const starts: number[] = [];
  const release: Array<() => void> = [];
  const runner = createPacedRunner(
    () =>
      new Promise<void>((resolve) => {
        starts.push(clock);
        release.push(resolve);
      }),
    {
      minGapMs,
      now: () => clock,
      setTimer: (callback, ms) => setTimeout(callback, ms),
    },
  );
  const advance = async (ms: number): Promise<void> => {
    clock += ms;
    await vi.advanceTimersByTimeAsync(ms);
  };
  const finish = async (): Promise<void> => {
    release.shift()?.();
    await vi.advanceTimersByTimeAsync(0);
  };
  return { runner, starts, advance, finish };
}

describe("createPacedRunner", () => {
  it("runs the first trigger at once and spaces later background triggers", async () => {
    const { runner, starts, advance, finish } = setup();

    runner.trigger();
    await finish();
    await advance(400);
    runner.trigger();
    await advance(400);
    runner.trigger();

    expect(starts).toEqual([0]);
    await advance(800);
    expect(starts).toEqual([0, 1600]);
    vi.useRealTimers();
  });

  it("answers a burst of triggers while a run is open with one trailing run", async () => {
    const { runner, starts, advance, finish } = setup();

    runner.trigger();
    runner.trigger();
    runner.trigger();
    await advance(10);
    await finish();
    await advance(1600);

    expect(starts).toHaveLength(2);
    vi.useRealTimers();
  });

  it("never starts more than one run per gap over seventy triggers 400 ms apart", async () => {
    const { runner, starts, advance, finish } = setup();

    for (let index = 0; index < 70; index += 1) {
      runner.trigger();
      await advance(400);
      await finish();
    }
    await advance(2000);
    await finish();

    const gaps = starts.slice(1).map((start, index) => start - (starts[index] as number));
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(1500);
    expect(starts.length).toBeLessThanOrEqual(Math.ceil(28_000 / 1500) + 2);
    vi.useRealTimers();
  });

  it("starts an immediate trigger without waiting for the gap", async () => {
    const { runner, starts, advance, finish } = setup();
    runner.trigger();
    await finish();
    await advance(100);

    runner.trigger({ immediate: true });

    expect(starts).toEqual([0, 100]);
    vi.useRealTimers();
  });

  it("upgrades a waiting paced run when an immediate trigger arrives during a run", async () => {
    const { runner, starts, advance, finish } = setup();
    runner.trigger();
    runner.trigger();
    runner.trigger({ immediate: true });
    await advance(50);
    await finish();

    expect(starts).toEqual([0, 50]);
    vi.useRealTimers();
  });

  it("starts nothing after it is cancelled", async () => {
    const { runner, starts, advance, finish } = setup();
    runner.trigger();
    runner.trigger();
    runner.cancel();
    await finish();
    await advance(5000);
    runner.trigger();

    expect(starts).toEqual([0]);
    vi.useRealTimers();
  });

  it("keeps going after a run that throws", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const runner = createPacedRunner(
      async () => {
        calls += 1;
        throw new Error("boom");
      },
      { minGapMs: 0 },
    );

    runner.trigger();
    await vi.advanceTimersByTimeAsync(0);
    runner.trigger();
    await vi.advanceTimersByTimeAsync(0);

    expect(calls).toBe(2);
    vi.useRealTimers();
  });
});
