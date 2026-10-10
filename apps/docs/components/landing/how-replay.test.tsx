// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TerminalProgress, TerminalProps } from "./terminal";

const terminal = vi.hoisted(() => ({
  report: undefined as ((progress: TerminalProgress) => void) | undefined,
  play: undefined as boolean | undefined,
}));
vi.mock("./terminal", () => ({
  Terminal: ({ onProgress, play }: TerminalProps) => {
    terminal.report = onProgress;
    terminal.play = play;
    return <div data-part="terminal" />;
  },
}));

type Callback = (entries: IntersectionObserverEntry[]) => void;
const observers: Array<{ callback: Callback; targets: Element[] }> = [];
vi.stubGlobal(
  "IntersectionObserver",
  class {
    readonly targets: Element[] = [];
    constructor(callback: Callback) {
      observers.push({ callback, targets: this.targets });
    }
    observe(element: Element): void {
      this.targets.push(element);
    }
    disconnect(): void {}
  },
);

function show(ratios: ReadonlyArray<number>): void {
  const observer = observers.at(-1);
  act(() =>
    observer?.callback(
      (observer.targets ?? []).map(
        (target, index) =>
          ({ target, intersectionRatio: ratios[index] ?? 0 }) as IntersectionObserverEntry,
      ),
    ),
  );
}

const { HowReplay } = await import("./how-replay");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const STEPS = (["setup", "translate", "check"] as const).map((key) => ({
  key,
  title: key,
  body: `${key} body`,
}));

let mounted: { container: HTMLDivElement; root: Root } | undefined;

afterEach(() => {
  act(() => mounted?.root.unmount());
  mounted?.container.remove();
  mounted = undefined;
});

function render(): HTMLDivElement {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mounted = { container, root };
  act(() => {
    root.render(
      <HowReplay terminal={{ commands: ["x"], sessionLabel: "Session" }} steps={STEPS} />,
    );
  });
  return container;
}

function states(container: HTMLDivElement): string[] {
  return [...container.querySelectorAll("li")].map(
    (li) => `${li.dataset.state}:${li.getAttribute("aria-current") ?? "-"}`,
  );
}

describe("HowReplay", () => {
  it("starts the replay only once the terminal and the step grid are both half in view", () => {
    render();
    expect(terminal.play).toBe(false);
    const observed = observers.at(-1)?.targets.map((target) => target.tagName);
    expect(observed).toEqual(["DIV", "OL"]);
    show([1, 0.2]);
    expect(terminal.play).toBe(false);
    show([0.6, 0.5]);
    expect(terminal.play).toBe(true);
  });

  it("numbers each step in order, beside its title", () => {
    const container = render();
    expect([...container.querySelectorAll("li h3")].map((h3) => h3.textContent)).toEqual([
      "setup",
      "translate",
      "check",
    ]);
    expect(
      [...container.querySelectorAll("li .vk-how-step-index")].map((index) => [
        index.textContent,
        index.getAttribute("aria-hidden"),
      ]),
    ).toEqual([
      ["01", "true"],
      ["02", "true"],
      ["03", "true"],
    ]);
  });

  it("starts with no current step, then moves aria-current with the terminal run", () => {
    const container = render();
    expect(states(container)).toEqual(["upcoming:-", "upcoming:-", "upcoming:-"]);
    act(() => terminal.report?.({ lines: 0, typing: true }));
    expect(states(container)[0]).toBe("current:step");
    act(() => terminal.report?.({ lines: 3, typing: false }));
    expect(states(container)).toEqual(["complete:-", "current:step", "upcoming:-"]);
  });

  it("leaves every step complete and none current once the run has printed", () => {
    const container = render();
    act(() => terminal.report?.({ lines: 99, typing: false }));
    expect(states(container)).toEqual(["complete:-", "complete:-", "complete:-"]);
    expect(container.querySelector('[aria-current="step"]')).toBeNull();
  });

  it("reveals the terminal before the steps", () => {
    const container = render();
    expect(container.querySelector('[data-part="terminal"]')?.parentElement?.dataset.reveal).toBe(
      "1",
    );
    expect(container.querySelector("ol")?.dataset.reveal).toBe("2");
  });
});
