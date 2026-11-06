// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "./test-support.js";
import { type FocusRegistry, useFocusRegistry } from "./use-focus-registry.js";

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
});
