// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RUN_SECONDS } from "@/lib/landing-canvas";
import { FeatureCanvas } from "./feature-canvas";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Fake = {
  clearRect: ReturnType<typeof vi.fn>;
  setTransform: ReturnType<typeof vi.fn>;
  fills: string[];
  [key: string]: unknown;
};

function fakeContext(): Fake {
  const fills: string[] = [];
  const target: Fake = { clearRect: vi.fn(), setTransform: vi.fn(), fills };
  for (const method of [
    "arc",
    "arcTo",
    "beginPath",
    "closePath",
    "fill",
    "fillRect",
    "lineTo",
    "moveTo",
    "restore",
    "save",
    "setLineDash",
    "stroke",
  ]) {
    target[method] = vi.fn();
  }
  Object.defineProperty(target, "fillStyle", {
    get: () => "",
    set: (value: string) => void fills.push(value),
  });
  return target;
}

let mounted: { host: HTMLDivElement; root: Root } | undefined;
let context: Fake | null;
let reduced: boolean;
let mediaListener: (() => void) | undefined;
let disconnects: string[];
let visibility: ((entries: Array<{ isIntersecting: boolean }>) => void) | undefined;
let resize: (() => void) | undefined;
let rafQueue: Array<(now: number) => void>;
let cancelled: number;

beforeEach(() => {
  context = fakeContext();
  reduced = false;
  mediaListener = undefined;
  visibility = undefined;
  resize = undefined;
  rafQueue = [];
  cancelled = 0;
  disconnects = [];
  document.documentElement.className = "";
  document.documentElement.style.setProperty("--accent", "rgb(1, 2, 3)");
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => context as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockReturnValue({
    width: 300,
    height: 190,
  } as DOMRect);
  vi.stubGlobal("matchMedia", () => ({
    get matches() {
      return reduced;
    },
    addEventListener: (_: string, listener: () => void) => {
      mediaListener = listener;
    },
    removeEventListener: () => {
      mediaListener = undefined;
    },
  }));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      disconnect() {
        disconnects.push("resize");
      }
    },
  );
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: (entries: Array<{ isIntersecting: boolean }>) => void) {
        visibility = callback;
      }
      observe() {}
      disconnect() {
        disconnects.push("intersection");
      }
    },
  );
  const dead = new Set<number>();
  let handles = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: (now: number) => void) => {
    handles += 1;
    const handle = handles;
    rafQueue.push((now) => {
      if (!dead.has(handle)) callback(now);
    });
    return handle;
  });
  vi.stubGlobal("cancelAnimationFrame", (handle: number) => {
    dead.add(handle);
    cancelled += 1;
  });
});

afterEach(() => {
  if (mounted) {
    act(() => mounted?.root.unmount());
    mounted.host.remove();
    mounted = undefined;
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mount(): HTMLCanvasElement {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<FeatureCanvas id="studio" phase={1.3} />));
  mounted = { host, root };
  return host.querySelector("canvas") as HTMLCanvasElement;
}

function fire(visible: boolean): void {
  act(() => visibility?.([{ isIntersecting: visible }]));
}

describe("FeatureCanvas", () => {
  it("renders one hidden canvas with no text", () => {
    const canvas = mount();
    expect(canvas.getAttribute("aria-hidden")).toBe("true");
    expect(mounted?.host.textContent).toBe("");
  });

  it("does nothing when the browser gives no 2d context", () => {
    context = null;
    expect(() => mount()).not.toThrow();
    expect(rafQueue).toHaveLength(0);
  });

  it("sizes the bitmap to the card times the pixel ratio, capped at two", () => {
    vi.stubGlobal("devicePixelRatio", 3);
    const canvas = mount();
    expect(canvas.width).toBe(600);
    expect(canvas.height).toBe(380);
    expect(context?.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
  });

  it("stays idle until the card is on screen, then loops and stops again offscreen", () => {
    mount();
    expect(rafQueue).toHaveLength(0);
    fire(true);
    expect(rafQueue).toHaveLength(1);
    const drawsBefore = context?.clearRect.mock.calls.length ?? 0;
    act(() => rafQueue.shift()?.(100));
    expect(context?.clearRect.mock.calls.length).toBeGreaterThan(drawsBefore);
    const cancelledBefore = cancelled;
    fire(false);
    expect(cancelled).toBeGreaterThan(cancelledBefore);
  });

  it("throttles frames that arrive faster than 30 per second", () => {
    mount();
    fire(true);
    act(() => rafQueue.shift()?.(100));
    const draws = context?.clearRect.mock.calls.length ?? 0;
    act(() => rafQueue.shift()?.(110));
    expect(context?.clearRect.mock.calls.length).toBe(draws);
    act(() => rafQueue.shift()?.(140));
    expect(context?.clearRect.mock.calls.length).toBe(draws + 1);
  });

  it("pauses while the document is hidden and resumes when it is shown", () => {
    mount();
    fire(true);
    let hidden = true;
    vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
    const cancelledBefore = cancelled;
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(cancelled).toBeGreaterThan(cancelledBefore);
    const queued = rafQueue.length;
    hidden = false;
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(rafQueue.length).toBe(queued + 1);
  });

  it("draws one static frame and never loops under reduced motion", () => {
    reduced = true;
    mount();
    fire(true);
    expect(rafQueue).toHaveLength(0);
    expect(context?.clearRect).toHaveBeenCalled();
  });

  it("reacts when reduced motion is switched on or off", () => {
    mount();
    fire(true);
    expect(rafQueue).toHaveLength(1);
    reduced = true;
    const cancelledBefore = cancelled;
    act(() => mediaListener?.());
    expect(cancelled).toBeGreaterThan(cancelledBefore);
    reduced = false;
    act(() => mediaListener?.());
    expect(rafQueue.length).toBeGreaterThan(1);
  });

  it("redraws on resize and re-reads the colors when the theme class changes", async () => {
    mount();
    const draws = context?.clearRect.mock.calls.length ?? 0;
    act(() => resize?.());
    expect(context?.clearRect.mock.calls.length).toBeGreaterThan(draws);
    document.documentElement.style.setProperty("--accent", "rgb(9, 9, 9)");
    context?.fills.splice(0);
    document.documentElement.classList.add("light");
    await act(async () => {
      await Promise.resolve();
    });
    expect(context?.fills).toContain("rgb(9, 9, 9)");
  });

  it("releases every observer and listener on unmount", () => {
    const mutation = vi.spyOn(MutationObserver.prototype, "disconnect");
    const removed = vi.spyOn(document, "removeEventListener");
    mount();
    fire(true);
    const cancelledBefore = cancelled;
    act(() => mounted?.root.unmount());
    mounted?.host.remove();
    mounted = undefined;
    expect(mediaListener).toBeUndefined();
    expect(cancelled).toBeGreaterThan(cancelledBefore);
    expect(disconnects).toEqual(expect.arrayContaining(["resize", "intersection"]));
    expect(mutation).toHaveBeenCalled();
    expect(removed).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
  });

  it("plays a bounded run, then holds its still frame and never loops again", () => {
    mount();
    fire(true);
    let now = 100;
    act(() => rafQueue.shift()?.(now));
    const steps = Math.ceil((RUN_SECONDS.studio * 1000) / 100) + 20;
    for (let step = 0; step < steps && rafQueue.length > 0; step += 1) {
      now += 100;
      act(() => rafQueue.shift()?.(now));
    }
    act(() => {
      for (const callback of rafQueue.splice(0)) callback(now + 100);
    });
    expect(rafQueue).toHaveLength(0);
    fire(false);
    fire(true);
    expect(rafQueue).toHaveLength(0);
  });
});
