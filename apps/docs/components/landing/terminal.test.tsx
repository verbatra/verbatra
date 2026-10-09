// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/use-in-view-once", () => ({
  useInViewOnce: () => [{ current: null }, true],
}));
vi.mock("@/lib/reduced-motion", () => ({ prefersReducedMotion: () => false }));

const { Terminal } = await import("./terminal");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const COMMANDS = ["verbatra check", "verbatra translate"];
const OUTPUTS = { 0: ["  de: 1 missing"], 1: ["  de: 2 translated"] };

function visibleLines(markup: string): string[] {
  const doc = new DOMParser().parseFromString(markup, "text/html");
  const screen = doc.querySelector('[aria-hidden="true"]');
  const layer = Array.from(screen?.children ?? []).find(
    (child) => !child.classList.contains("invisible"),
  );
  return Array.from(layer?.children ?? []).map((line) => line.textContent ?? "");
}

describe("Terminal: first frame", () => {
  it("paints nothing before playback by default", () => {
    const markup = renderToStaticMarkup(
      <Terminal commands={COMMANDS} outputs={OUTPUTS} sessionLabel="Session" fitContent bare />,
    );
    expect(visibleLines(markup)).toEqual([]);
  });

  it("paints the settled commands and their output before playback starts", () => {
    const markup = renderToStaticMarkup(
      <Terminal
        commands={COMMANDS}
        outputs={OUTPUTS}
        sessionLabel="Session"
        fitContent
        bare
        settledCommands={1}
      />,
    );
    expect(visibleLines(markup)).toEqual(["$ verbatra check", "  de: 1 missing"]);
  });
});

describe("Terminal: line layout", () => {
  function lineClasses(wrap: boolean): ReadonlyArray<string> {
    const markup = renderToStaticMarkup(
      <Terminal
        commands={COMMANDS}
        outputs={OUTPUTS}
        sessionLabel="Session"
        fitContent
        wrap={wrap}
        settledCommands={2}
        highlight="  de: 2 translated"
      />,
    );
    const doc = new DOMParser().parseFromString(markup, "text/html");
    return Array.from(doc.querySelectorAll('[aria-hidden="true"] > div:not(.invisible) > div')).map(
      (line) => line.className,
    );
  }

  it("keeps every line on one row and scrolls sideways by default", () => {
    const classes = lineClasses(false);
    expect(classes).toHaveLength(4);
    for (const name of classes) expect(name).toContain("whitespace-pre");
  });

  it("wraps every line, the highlighted one included, with a hanging indent when asked to", () => {
    const classes = lineClasses(true);
    expect(classes).toHaveLength(4);
    for (const name of classes) {
      expect(name).toContain("vk-wrap-line");
      expect(name).not.toContain("whitespace-pre");
    }
  });
});

const SETTLED = [
  "$ verbatra check",
  "  de: 1 missing",
  "$ verbatra translate",
  "  de: 2 translated",
];
const HOLD_PAUSE_MS = 2600;
const PASS_MS = 800;
const REPLAY_MS = 1500;
const STEP_MS = 10;

describe("Terminal: playback", () => {
  let mounted: { container: HTMLDivElement; root: Root } | undefined;

  function play(outputs: typeof OUTPUTS = OUTPUTS): HTMLDivElement {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    mounted = { container, root };
    act(() => {
      root.render(
        <Terminal
          commands={COMMANDS}
          outputs={outputs}
          sessionLabel="Session"
          settledCommands={1}
          typingSpeed={5}
          delayBetweenCommands={50}
          initialDelay={20}
        />,
      );
    });
    return container;
  }

  function lines(container: HTMLDivElement): string[] {
    const layer = container.querySelector('[aria-hidden="true"] > div');
    return Array.from(layer?.children ?? [])
      .filter((line) => !line.hasAttribute("data-typing"))
      .map((line) => line.textContent ?? "");
  }

  async function sample(container: HTMLDivElement, ms: number): Promise<string[][]> {
    const frames: string[][] = [];
    for (let elapsed = 0; elapsed < ms; elapsed += STEP_MS) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(STEP_MS);
      });
      frames.push(lines(container));
    }
    return frames;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
  });

  afterEach(() => {
    if (mounted) {
      const { container, root } = mounted;
      act(() => root.unmount());
      container.remove();
      mounted = undefined;
    }
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("plays the first pass from the settled commands on, without clearing them", async () => {
    const container = play();
    expect(lines(container)).toEqual(SETTLED.slice(0, 2));
    const frames = await sample(container, PASS_MS);
    for (const frame of frames) {
      expect(frame.slice(0, 2)).toEqual(SETTLED.slice(0, 2));
      expect(frame.length).toBeLessThanOrEqual(SETTLED.length);
    }
    expect(frames.at(-1)).toEqual(SETTLED);
  });

  it("restarts the loop from an empty screen and replays every command once", async () => {
    const container = play();
    await sample(container, PASS_MS);
    const frames = await sample(container, HOLD_PAUSE_MS + REPLAY_MS);
    expect(frames.some((frame) => frame.length === 0)).toBe(true);
    for (const frame of frames) {
      expect(frame).toEqual(SETTLED.slice(0, frame.length));
    }
    expect(frames.at(-1)).toEqual(SETTLED);
  });

  it("restarts from the settled commands when the effect runs again, without duplicating a line", async () => {
    const container = play();
    await sample(container, 400);
    act(() => {
      mounted?.root.render(
        <Terminal
          commands={COMMANDS}
          outputs={{ ...OUTPUTS }}
          sessionLabel="Session"
          settledCommands={1}
          typingSpeed={5}
          delayBetweenCommands={50}
          initialDelay={20}
        />,
      );
    });
    const frames = await sample(container, PASS_MS);
    for (const frame of frames) {
      expect(frame).toEqual(SETTLED.slice(0, frame.length));
    }
    expect(frames.at(-1)).toEqual(SETTLED);
  });
});
