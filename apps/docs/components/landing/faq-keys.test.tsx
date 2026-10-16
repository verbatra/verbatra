// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { FAQ_KEYS_ATTACHED, FaqKeys } from "./faq-keys";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
});

function mount(listId = "faq-list"): { list: HTMLElement; unmount: () => void } {
  document.body.innerHTML = [
    '<div id="faq-list">',
    ...["a", "b", "c"].map((id) => `<details data-faq="${id}"><summary>${id}</summary></details>`),
    '</div><div id="host"></div>',
  ].join("");
  const root = createRoot(document.getElementById("host") as HTMLElement);
  act(() => root.render(<FaqKeys listId={listId} />));
  return {
    list: document.getElementById("faq-list") as HTMLElement,
    unmount: () => act(() => root.unmount()),
  };
}

function summaries(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-faq] > summary"));
}

function press(target: HTMLElement, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

describe("FaqKeys", () => {
  it("marks the list while it listens, so a test can wait for the island", () => {
    const { list, unmount } = mount();
    expect(list.hasAttribute(FAQ_KEYS_ATTACHED)).toBe(true);
    unmount();
    expect(list.hasAttribute(FAQ_KEYS_ATTACHED)).toBe(false);
  });

  it("moves focus with the arrow keys, wrapping at both ends, and with Home and End", () => {
    const { unmount } = mount();
    const [first, second, last] = summaries();
    first?.focus();
    press(first as HTMLElement, "ArrowDown");
    expect(document.activeElement).toBe(second);
    press(second as HTMLElement, "End");
    expect(document.activeElement).toBe(last);
    press(last as HTMLElement, "ArrowDown");
    expect(document.activeElement).toBe(first);
    press(first as HTMLElement, "ArrowUp");
    expect(document.activeElement).toBe(last);
    press(last as HTMLElement, "Home");
    expect(document.activeElement).toBe(first);
    unmount();
  });

  it("leaves other keys, modified keys and handled events alone", () => {
    const { list, unmount } = mount();
    const [first] = summaries();
    first?.focus();
    expect(press(first as HTMLElement, "Enter").defaultPrevented).toBe(false);
    expect(press(first as HTMLElement, "ArrowDown", { shiftKey: true }).defaultPrevented).toBe(
      false,
    );
    expect(press(list, "ArrowDown").defaultPrevented).toBe(false);
    const handled = new KeyboardEvent("keydown", {
      key: "ArrowDown",
      bubbles: true,
      cancelable: true,
    });
    handled.preventDefault();
    first?.dispatchEvent(handled);
    expect(document.activeElement).toBe(first);
    unmount();
  });

  it("does nothing when the list is missing", () => {
    const { list, unmount } = mount("missing");
    expect(list.hasAttribute(FAQ_KEYS_ATTACHED)).toBe(false);
    unmount();
  });
});
