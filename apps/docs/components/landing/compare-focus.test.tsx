// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { COMPARE_FOCUS_ATTACHED, CompareFocus } from "./compare-focus";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
});

function mount(): {
  region: HTMLElement;
  ref: HTMLElement;
  outside: HTMLElement;
  unmount: () => void;
} {
  document.body.innerHTML =
    '<section data-compare-scroll tabindex="0"><a href="#s1" id="ref">1</a></section><a href="#x" id="outside">x</a><div id="host"></div>';
  const root = createRoot(document.getElementById("host") as HTMLElement);
  act(() => root.render(<CompareFocus />));
  return {
    region: document.querySelector("[data-compare-scroll]") as HTMLElement,
    ref: document.getElementById("ref") as HTMLElement,
    outside: document.getElementById("outside") as HTMLElement,
    unmount: () => act(() => root.unmount()),
  };
}

function focusVisibly(element: HTMLElement, visible: boolean): void {
  const matches = element.matches.bind(element);
  Object.defineProperty(element, "matches", {
    configurable: true,
    value: (selector: string) => (selector === ":focus-visible" ? visible : matches(selector)),
  });
  element.focus();
}

describe("CompareFocus", () => {
  it("scrolls a control focused inside the table clear of the pinned column", () => {
    const { ref, unmount } = mount();
    const scroll = vi.fn();
    ref.scrollIntoView = scroll;
    focusVisibly(ref, true);
    expect(scroll).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
    unmount();
  });

  it("leaves a control focused by a pointer where it is, so a click lands on what was pressed", () => {
    const { ref, unmount } = mount();
    const scroll = vi.fn();
    ref.scrollIntoView = scroll;
    focusVisibly(ref, false);
    expect(scroll).not.toHaveBeenCalled();
    unmount();
  });

  it("leaves the scroll region itself and anything outside the table alone", () => {
    const { region, outside, unmount } = mount();
    const regionScroll = vi.fn();
    const outsideScroll = vi.fn();
    region.scrollIntoView = regionScroll;
    outside.scrollIntoView = outsideScroll;
    focusVisibly(region, true);
    focusVisibly(outside, true);
    expect(regionScroll).not.toHaveBeenCalled();
    expect(outsideScroll).not.toHaveBeenCalled();
    unmount();
  });

  it("marks the document while it listens, so a test can wait for the island", () => {
    const { unmount } = mount();
    expect(document.documentElement.hasAttribute(COMPARE_FOCUS_ATTACHED)).toBe(true);
    unmount();
    expect(document.documentElement.hasAttribute(COMPARE_FOCUS_ATTACHED)).toBe(false);
  });

  it("stops listening once unmounted", () => {
    const { ref, unmount } = mount();
    const scroll = vi.fn();
    ref.scrollIntoView = scroll;
    unmount();
    focusVisibly(ref, true);
    expect(scroll).not.toHaveBeenCalled();
  });
});
