// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LockDemoMotion } from "./lock-demo-motion";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const STEPS = [
  { id: "frame-1", label: "Edit", text: "first", dwellMs: 5000 },
  { id: "frame-2", label: "Compare", text: "second", dwellMs: 8000 },
  { id: "frame-3", label: "Send", text: "third", dwellMs: 6000 },
];

const LABELS = { steps: "Steps", pause: "Pause animation", play: "Play animation" };

const mounted: Array<{ root: Root; host: HTMLElement }> = [];

const stage = { matches: true, listeners: new Set<() => void>() };

const observers: Array<(entries: ReadonlyArray<Partial<IntersectionObserverEntry>>) => void> = [];

beforeEach(() => {
  stage.matches = true;
  stage.listeners.clear();
  observers.length = 0;
  vi.stubGlobal("matchMedia", (query: string) => ({
    media: query,
    get matches() {
      return stage.matches;
    },
    addEventListener: (_type: string, listener: () => void) => stage.listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => stage.listeners.delete(listener),
  }));
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: (entries: ReadonlyArray<Partial<IntersectionObserverEntry>>) => void) {
        observers.push(callback);
      }
      observe(): void {}
      disconnect(): void {}
    },
  );
});

afterEach(() => {
  for (const { root, host } of mounted.splice(0)) {
    act(() => root.unmount());
    host.remove();
  }
  vi.unstubAllGlobals();
});

function mount(): HTMLElement {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  mounted.push({ root, host });
  act(() =>
    root.render(
      <LockDemoMotion steps={STEPS} labels={LABELS}>
        {STEPS.map(({ id }) => (
          <figure key={id} id={id} className="vk-lock-frame">
            {id}
          </figure>
        ))}
      </LockDemoMotion>,
    ),
  );
  return host;
}

function frames(host: HTMLElement): HTMLElement[] {
  return Array.from(host.querySelectorAll<HTMLElement>(".vk-lock-frame"));
}

function stepButtons(host: HTMLElement): HTMLButtonElement[] {
  return Array.from(host.querySelectorAll<HTMLButtonElement>(".vk-lock-step"));
}

function activeFrameIds(host: HTMLElement): string[] {
  return frames(host)
    .filter((frame) => frame.hasAttribute("data-active"))
    .map((frame) => frame.id);
}

function finishProgress(host: HTMLElement, index: number): void {
  const bar = stepButtons(host)[index]?.querySelector(".vk-lock-prog");
  if (bar === null || bar === undefined) throw new Error("no progress bar");
  const event = new Event("animationend", { bubbles: true });
  Object.assign(event, { animationName: "vk-lock-progress" });
  act(() => {
    bar.dispatchEvent(event);
  });
}

function root(host: HTMLElement): HTMLElement {
  return host.querySelector<HTMLElement>(".vk-lock-stage") as HTMLElement;
}

describe("LockDemoMotion on a wide screen with motion", () => {
  it("enters stage mode and shows only the first frame, the others inert and hidden from assistive technology", () => {
    const host = mount();
    expect(root(host).getAttribute("data-mode")).toBe("stage");
    expect(activeFrameIds(host)).toEqual(["frame-1"]);
    const [, second] = frames(host);
    expect(second?.hasAttribute("inert")).toBe(true);
    expect(second?.getAttribute("aria-hidden")).toBe("true");
    expect(frames(host)[0]?.hasAttribute("inert")).toBe(false);
  });

  it("names each step button's frame with aria-controls and marks the current step", () => {
    const host = mount();
    expect(stepButtons(host).map((button) => button.getAttribute("aria-controls"))).toEqual(
      STEPS.map((step) => step.id),
    );
    expect(stepButtons(host).map((button) => button.getAttribute("aria-current"))).toEqual([
      "step",
      null,
      null,
    ]);
    expect(host.querySelector("ol")?.getAttribute("aria-label")).toBe("Steps");
  });

  it("gives each step its own dwell time, the lock frame the longest", () => {
    const host = mount();
    const dwells = stepButtons(host).map((button) => button.style.getPropertyValue("--lock-dwell"));
    expect(dwells).toEqual(["5000ms", "8000ms", "6000ms"]);
  });

  it("advances when the current step's progress bar finishes and wraps after the last", () => {
    const host = mount();
    finishProgress(host, 0);
    expect(activeFrameIds(host)).toEqual(["frame-2"]);
    finishProgress(host, 1);
    finishProgress(host, 2);
    expect(activeFrameIds(host)).toEqual(["frame-1"]);
  });

  it("ignores an animation that is not the progress bar", () => {
    const host = mount();
    const bar = stepButtons(host)[0]?.querySelector(".vk-lock-prog");
    const event = new Event("animationend", { bubbles: true });
    Object.assign(event, { animationName: "other" });
    act(() => {
      bar?.dispatchEvent(event);
    });
    expect(activeFrameIds(host)).toEqual(["frame-1"]);
  });

  it("jumps to a clicked step and pauses the animation", () => {
    const host = mount();
    act(() => stepButtons(host)[2]?.click());
    expect(activeFrameIds(host)).toEqual(["frame-3"]);
    expect(root(host).hasAttribute("data-paused")).toBe(true);
    const pause = host.querySelector<HTMLButtonElement>(".vk-lock-pause");
    expect(pause?.textContent).toBe("Play animation");
    expect(root(host).hasAttribute("data-userpaused")).toBe(true);
  });

  it("pauses the progress bar itself while the animation is held", () => {
    const host = mount();
    const bar = host.querySelector<HTMLElement>(".vk-lock-prog");
    expect(bar?.style.animationPlayState).toBe("running");
    act(() => host.querySelector<HTMLButtonElement>(".vk-lock-pause")?.click());
    expect(bar?.style.animationPlayState).toBe("paused");
  });

  it("pauses and resumes from its own button, naming the action", () => {
    const host = mount();
    const pause = host.querySelector<HTMLButtonElement>(".vk-lock-pause");
    expect(pause?.textContent).toBe("Pause animation");
    expect(root(host).hasAttribute("data-paused")).toBe(false);
    act(() => pause?.click());
    expect(root(host).hasAttribute("data-paused")).toBe(true);
    expect(pause?.textContent).toBe("Play animation");
    act(() => pause?.click());
    expect(root(host).hasAttribute("data-paused")).toBe(false);
  });

  it("holds the animation while the section is offscreen without changing the button", () => {
    const host = mount();
    act(() => observers[0]?.([{ isIntersecting: false }]));
    expect(root(host).hasAttribute("data-paused")).toBe(true);
    expect(host.querySelector(".vk-lock-pause")?.textContent).toBe("Pause animation");
    act(() => observers[0]?.([{ isIntersecting: true }]));
    expect(root(host).hasAttribute("data-paused")).toBe(false);
  });
});

describe("LockDemoMotion without stage conditions", () => {
  it("keeps every frame visible and plain, in the stacked layout, when motion is reduced or the screen is narrow", () => {
    stage.matches = false;
    const host = mount();
    expect(root(host).hasAttribute("data-mode")).toBe(false);
    for (const frame of frames(host)) {
      expect(frame.hasAttribute("data-active")).toBe(false);
      expect(frame.hasAttribute("inert")).toBe(false);
      expect(frame.hasAttribute("aria-hidden")).toBe(false);
    }
  });

  it("switches modes live when the condition changes", () => {
    const host = mount();
    stage.matches = false;
    act(() => {
      for (const listener of stage.listeners) listener();
    });
    expect(root(host).hasAttribute("data-mode")).toBe(false);
    expect(frames(host).every((frame) => !frame.hasAttribute("inert"))).toBe(true);
    stage.matches = true;
    act(() => {
      for (const listener of stage.listeners) listener();
    });
    expect(root(host).getAttribute("data-mode")).toBe("stage");
    expect(activeFrameIds(host)).toEqual(["frame-1"]);
  });
});
