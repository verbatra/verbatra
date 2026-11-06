// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "./test-support.js";
import { type FocusRegistry, focusIsFree, useFocusRegistry } from "./use-focus-registry.js";

let registry: FocusRegistry | undefined;

function Probe(): ReactNode {
  registry = useFocusRegistry();
  return (
    <>
      <header />
      <input aria-label="field" ref={registry.register("field")} />
    </>
  );
}

function rects(header: number, top: number, bottom: number): void {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    const isHeader = this.tagName === "HEADER";
    return {
      top: isHeader ? 0 : top,
      bottom: isHeader ? header : bottom,
    } as DOMRect;
  });
}

afterEach(() => vi.restoreAllMocks());

describe("useFocusRegistry reveal", () => {
  it("scrolls a focused field out from under the sticky header", () => {
    const scrollBy = vi.fn();
    vi.stubGlobal("scrollBy", scrollBy);
    rects(56, 10, 40);
    render(<Probe />);

    act(() => registry?.request(["field"]));

    expect(document.activeElement).toBe(document.querySelector("input"));
    expect(scrollBy).toHaveBeenCalledWith(0, 10 - 56 - 12);
    vi.unstubAllGlobals();
  });

  it("scrolls a field below the viewport into view and leaves a visible one alone", () => {
    const scrollBy = vi.fn();
    vi.stubGlobal("scrollBy", scrollBy);
    rects(56, window.innerHeight + 100, window.innerHeight + 140);
    render(<Probe />);
    act(() => registry?.request(["field"]));
    expect(scrollBy).toHaveBeenCalledWith(0, 140 + 12);

    scrollBy.mockClear();
    vi.restoreAllMocks();
    rects(56, 200, 240);
    act(() => registry?.request(["field"]));
    expect(scrollBy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("reveals the field again after the browser restores the scroll on a landing", () => {
    const scrollBy = vi.fn();
    vi.stubGlobal("scrollBy", scrollBy);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
    rects(56, 10, 40);
    render(<Probe />);
    act(() => registry?.request(["field"]));
    expect(scrollBy).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(scrollBy).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  it("stops listening for a landing after a short window", () => {
    vi.useFakeTimers();
    const scrollBy = vi.fn();
    vi.stubGlobal("scrollBy", scrollBy);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
    rects(56, 10, 40);
    render(<Probe />);
    act(() => registry?.request(["field"]));
    act(() => {
      vi.advanceTimersByTime(700);
    });
    scrollBy.mockClear();

    act(() => {
      window.dispatchEvent(new PopStateEvent("hashchange"));
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(scrollBy).not.toHaveBeenCalled();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("brings the field to the top below the header when asked, not only into view", () => {
    const scrollBy = vi.fn();
    vi.stubGlobal("scrollBy", scrollBy);
    rects(56, 300, 340);
    render(<Probe />);

    act(() => registry?.request(["field"], { align: "top" }));

    expect(scrollBy).toHaveBeenCalledWith(0, 300 - 56 - 12);
    vi.unstubAllGlobals();
  });

  it("knows whether focus is free to move", () => {
    render(<Probe />);
    expect(focusIsFree(null)).toBe(true);
    const input = document.querySelector("input") as HTMLInputElement;
    input.focus();
    expect(focusIsFree(null)).toBe(false);
    expect(focusIsFree(input.parentElement)).toBe(true);
  });

  it("stops listening when the component unmounts, so nothing outlives the test environment", () => {
    vi.useFakeTimers();
    const scrollBy = vi.fn();
    vi.stubGlobal("scrollBy", scrollBy);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
    rects(56, 10, 40);
    const view = render(<Probe />);
    act(() => registry?.request(["field"]));
    scrollBy.mockClear();

    view.unmount();
    window.dispatchEvent(new PopStateEvent("popstate"));
    vi.advanceTimersByTime(1_000);

    expect(scrollBy).not.toHaveBeenCalled();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps one landing watch when a new focus is requested", () => {
    vi.useFakeTimers();
    const scrollBy = vi.fn();
    vi.stubGlobal("scrollBy", scrollBy);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
    rects(56, 10, 40);
    render(<Probe />);
    act(() => registry?.request(["field"]));
    act(() => registry?.request(["field"]));
    scrollBy.mockClear();

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(scrollBy).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("leaves focus alone when no requested key is registered", () => {
    render(<Probe />);
    const before = document.activeElement;

    act(() => registry?.request(["missing", "also-missing"]));

    expect(document.activeElement).toBe(before);
  });
});
