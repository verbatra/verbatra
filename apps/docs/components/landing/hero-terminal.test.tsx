// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  HERO_CHECK_COMMAND,
  HERO_CHECK_OUTPUT,
  HERO_TRANSLATE_COMMAND,
  HERO_TRANSLATE_OUTPUT,
} from "@/lib/hero-terminal";

const motion = vi.hoisted(() => ({ reduce: false }));
vi.mock("@/lib/reduced-motion", () => ({ prefersReducedMotion: () => motion.reduce }));

type ObserverEntry = { callback: IntersectionObserverCallback; target: Element | null };
const observers: ObserverEntry[] = [];

class FakeObserver {
  readonly entry: ObserverEntry;
  constructor(callback: IntersectionObserverCallback) {
    this.entry = { callback, target: null };
    observers.push(this.entry);
  }
  observe(target: Element): void {
    this.entry.target = target;
  }
  disconnect(): void {
    this.entry.target = null;
  }
  unobserve(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

const { HeroTerminal, heroTerminalOutputs, HERO_TERMINAL_TITLE } = await import("./hero-terminal");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const EXIT_LINES = ["exit 1", "exit 0"];

let mounted: { container: HTMLDivElement; root: Root } | undefined;

function render(): HTMLDivElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<HeroTerminal session="Session" replay="Replay" exitLines={EXIT_LINES} />));
  mounted = { container, root };
  return container;
}

function setVisible(visible: boolean): void {
  act(() => {
    for (const { callback, target } of observers) {
      if (!target) continue;
      callback(
        [{ isIntersecting: visible, target } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    }
  });
}

function painted(container: HTMLElement): string[] {
  const screen = container.querySelector('.vk-terminal-scroll[aria-hidden="true"]');
  const layer = Array.from(screen?.children ?? []).find(
    (child) => !child.classList.contains("invisible"),
  );
  return Array.from(layer?.children ?? [], (line) => line.textContent ?? "");
}

const CHECK_FRAME = [`$ ${HERO_CHECK_COMMAND}`, ...HERO_CHECK_OUTPUT, "exit 1"];
const FINAL_FRAME = [
  ...CHECK_FRAME,
  `$ ${HERO_TRANSLATE_COMMAND}`,
  ...HERO_TRANSLATE_OUTPUT,
  "exit 0",
];

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => setTimeout(fn, 0));
  motion.reduce = false;
  observers.length = 0;
});

afterEach(() => {
  if (mounted) {
    act(() => mounted?.root.unmount());
    mounted.container.remove();
    mounted = undefined;
  }
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("heroTerminalOutputs", () => {
  it("closes each run with its exit line and leaves a run without one as printed", () => {
    expect(heroTerminalOutputs(EXIT_LINES)).toEqual({
      0: [...HERO_CHECK_OUTPUT, "exit 1"],
      1: [...HERO_TRANSLATE_OUTPUT, "exit 0"],
    });
    expect(heroTerminalOutputs([])[1]).toEqual(HERO_TRANSLATE_OUTPUT);
  });
});

describe("HeroTerminal", () => {
  it("opens on the finished check run and titles the window", () => {
    const container = render();
    expect(painted(container)).toEqual(CHECK_FRAME);
    expect(container.textContent).toContain(HERO_TERMINAL_TITLE);
  });

  it("types and prints the translate run once it is on screen, then stops", async () => {
    const container = render();
    setVisible(true);
    await advance(20_000);
    expect(painted(container)).toEqual(FINAL_FRAME);
    await advance(20_000);
    expect(painted(container)).toEqual(FINAL_FRAME);
  });

  it("shows the final frame at once under reduced motion", () => {
    motion.reduce = true;
    const container = render();
    setVisible(true);
    expect(painted(container)).toEqual(FINAL_FRAME);
  });

  it("does not play while off screen and pauses when scrolled away", async () => {
    const container = render();
    await advance(20_000);
    expect(painted(container)).toEqual(CHECK_FRAME);
    setVisible(true);
    await advance(600);
    setVisible(false);
    const frozen = painted(container);
    await advance(20_000);
    expect(painted(container)).toEqual(frozen);
    expect(frozen).not.toEqual(FINAL_FRAME);
  });

  it("replays both runs from an empty prompt when Replay is pressed", async () => {
    const container = render();
    setVisible(true);
    await advance(20_000);
    const replay = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Replay",
    );
    act(() => replay?.click());
    setVisible(true);
    await advance(50);
    expect(painted(container).join("\n")).not.toContain(HERO_TRANSLATE_OUTPUT[1]);
    await advance(30_000);
    expect(painted(container)).toEqual(FINAL_FRAME);
  });
});
