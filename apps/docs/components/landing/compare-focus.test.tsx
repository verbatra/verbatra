// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompareFocus } from "./compare-focus";

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

describe("CompareFocus", () => {
  it("scrolls a control focused inside the table clear of the pinned column", () => {
    const { ref, unmount } = mount();
    const scroll = vi.fn();
    ref.scrollIntoView = scroll;
    ref.focus();
    expect(scroll).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
    unmount();
  });

  it("leaves the scroll region itself and anything outside the table alone", () => {
    const { region, outside, unmount } = mount();
    const regionScroll = vi.fn();
    const outsideScroll = vi.fn();
    region.scrollIntoView = regionScroll;
    outside.scrollIntoView = outsideScroll;
    region.focus();
    outside.focus();
    expect(regionScroll).not.toHaveBeenCalled();
    expect(outsideScroll).not.toHaveBeenCalled();
    unmount();
  });

  it("stops listening once unmounted", () => {
    const { ref, unmount } = mount();
    const scroll = vi.fn();
    ref.scrollIntoView = scroll;
    unmount();
    ref.focus();
    expect(scroll).not.toHaveBeenCalled();
  });
});
