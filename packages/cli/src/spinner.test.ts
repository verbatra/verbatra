import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CLEAR_LINE,
  createLineSettler,
  createSpinner,
  SPINNER_DELAY_MS,
  SPINNER_FRAMES,
  SPINNER_INTERVAL_MS,
  systemClock,
} from "./spinner.js";
import { fakeClock } from "./test-support.js";

function recorder(): { write: (text: string) => void; text: () => string } {
  const chunks: string[] = [];
  return { write: (text) => chunks.push(text), text: () => chunks.join("") };
}

describe("createSpinner", () => {
  it("draws nothing before the delay, so a fast task never flickers", () => {
    const clock = fakeClock();
    const out = recorder();

    const spinner = createSpinner(out.write, "loading...", clock);
    spinner.stop();

    expect(out.text()).toBe("");
    expect(clock.timers[0]?.ms).toBe(SPINNER_DELAY_MS);
    expect(clock.timers[0]?.cleared).toBe(true);
  });

  it("draws the first ASCII frame after the delay and advances one frame per interval", () => {
    const clock = fakeClock();
    const out = recorder();

    createSpinner(out.write, "loading...", clock);
    clock.fireDelay();
    clock.tick(4);

    const frames = SPINNER_FRAMES.map((frame) => `${CLEAR_LINE}${frame} loading...`).join("");
    expect(out.text()).toBe(`${frames}${CLEAR_LINE}| loading...`);
    expect(clock.timers[1]?.ms).toBe(SPINNER_INTERVAL_MS);
  });

  it("uses only ASCII frames", () => {
    expect(SPINNER_FRAMES.join("")).toMatch(/^[\x20-\x7e]+$/);
  });

  it("redraws with new text once drawn, and only remembers it before", () => {
    const clock = fakeClock();
    const out = recorder();

    const spinner = createSpinner(out.write, "a", clock);
    spinner.update("b");
    expect(out.text()).toBe("");
    clock.fireDelay();
    spinner.update("c");

    expect(out.text()).toBe(`${CLEAR_LINE}| b${CLEAR_LINE}| c`);
  });

  it("clears its line on stop and stops ticking, once", () => {
    const clock = fakeClock();
    const out = recorder();

    const spinner = createSpinner(out.write, "a", clock);
    clock.fireDelay();
    spinner.stop();
    spinner.stop();
    clock.tick();
    spinner.update("ignored");

    expect(out.text()).toBe(`${CLEAR_LINE}| a${CLEAR_LINE}`);
    expect(clock.timers.every((timer) => timer.cleared)).toBe(true);
  });

  it("clear() erases a drawn frame so another line can be written, and the next tick redraws", () => {
    const clock = fakeClock();
    const out = recorder();

    const spinner = createSpinner(out.write, "a", clock);
    spinner.clear();
    expect(out.text()).toBe("");
    clock.fireDelay();
    spinner.clear();
    spinner.clear();
    clock.tick();

    expect(out.text()).toBe(`${CLEAR_LINE}| a${CLEAR_LINE}${CLEAR_LINE}/ a`);
  });

  it("never draws when stopped before the delay fires", () => {
    const clock = fakeClock();
    const out = recorder();

    const spinner = createSpinner(out.write, "a", clock);
    const delay = clock.timers[0];
    spinner.stop();
    delay?.callback();

    expect(out.text()).toBe("");
  });

  it("unrefs its timers so a spinner never keeps the process alive", () => {
    const clock = fakeClock();

    createSpinner(recorder().write, "a", clock);
    clock.fireDelay();

    expect(clock.timers.map((timer) => timer.unrefCalls)).toEqual([1, 1]);
  });
});

describe("systemClock", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("schedules and cancels timers through the global timer functions", () => {
    vi.useFakeTimers();
    const fired = { timeout: 0, cancelled: 0, interval: 0 };
    systemClock.setTimeout(() => {
      fired.timeout += 1;
    }, 1);
    const cancelled = systemClock.setTimeout(() => {
      fired.cancelled += 1;
    }, 1);
    systemClock.clearTimeout(cancelled);
    const interval = systemClock.setInterval(() => {
      fired.interval += 1;
    }, 1);
    vi.advanceTimersByTime(3);
    systemClock.clearInterval(interval);
    vi.advanceTimersByTime(10);

    expect(fired.timeout).toBe(1);
    expect(fired.cancelled).toBe(0);
    expect(fired.interval).toBe(3);
  });
});

describe("createLineSettler", () => {
  it("clears a drawn spinner frame so an exit leaves no fragment behind", () => {
    const out = recorder();
    const settler = createLineSettler(out.write);

    settler.write(`${CLEAR_LINE}| translating...`);
    settler.settle();
    settler.settle();

    expect(out.text()).toBe(`${CLEAR_LINE}| translating...${CLEAR_LINE}`);
  });

  it("ends an open plain line with a newline instead of erasing it", () => {
    const out = recorder();
    const settler = createLineSettler(out.write);

    settler.write("verbatra: exporting...");
    settler.settle();

    expect(out.text()).toBe("verbatra: exporting...\n");
  });

  it.each([
    ["a finished line", "verbatra: done\n"],
    ["a spinner that already cleared itself", CLEAR_LINE],
  ])("writes nothing after %s", (_label, text) => {
    const out = recorder();
    const settler = createLineSettler(out.write);

    settler.write(text);
    settler.write("");
    settler.settle();

    expect(out.text()).toBe(text);
  });
});
