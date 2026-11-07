import { describe, expect, it } from "vitest";
import { createCoalescedRunner } from "./coalesce.js";

function deferredRuns(): {
  readonly run: () => Promise<void>;
  readonly started: () => number;
  finish(index: number): Promise<void>;
} {
  const resolvers: Array<() => void> = [];
  return {
    run: () =>
      new Promise<void>((resolve) => {
        resolvers.push(resolve);
      }),
    started: () => resolvers.length,
    async finish(index) {
      resolvers[index]?.();
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

describe("createCoalescedRunner", () => {
  it("starts a run at once when none is in flight", () => {
    const runs = deferredRuns();

    createCoalescedRunner(runs.run).trigger();

    expect(runs.started()).toBe(1);
  });

  it("runs once more, not once per trigger, after a burst during a run", async () => {
    const runs = deferredRuns();
    const runner = createCoalescedRunner(runs.run);

    runner.trigger();
    for (let index = 0; index < 50; index += 1) {
      runner.trigger();
    }
    expect(runs.started()).toBe(1);

    await runs.finish(0);
    expect(runs.started()).toBe(2);

    await runs.finish(1);
    await Promise.resolve();
    expect(runs.started()).toBe(2);
  });

  it("never runs two at once", async () => {
    let active = 0;
    let peak = 0;
    const runner = createCoalescedRunner(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
    });

    for (let index = 0; index < 5; index += 1) {
      runner.trigger();
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(peak).toBe(1);
  });

  it("runs again for a trigger that arrives after the burst has finished", async () => {
    const runs = deferredRuns();
    const runner = createCoalescedRunner(runs.run);

    runner.trigger();
    await runs.finish(0);
    runner.trigger();

    expect(runs.started()).toBe(2);
  });

  it("keeps the trailing run when the run in flight fails", async () => {
    let calls = 0;
    const runner = createCoalescedRunner(async () => {
      calls += 1;
      if (calls === 1) {
        await Promise.resolve();
        throw new Error("boom");
      }
    });

    runner.trigger();
    runner.trigger();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(calls).toBe(2);
  });

  it("can run again after a failure", async () => {
    let calls = 0;
    const runner = createCoalescedRunner(async () => {
      calls += 1;
      throw new Error("boom");
    });

    runner.trigger();
    await new Promise((resolve) => setTimeout(resolve, 5));
    runner.trigger();
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(calls).toBe(2);
  });
});
