// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FAQ_HEAD_SIZE, FAQ_KEYS_ATTACHED, FaqKeys } from "./faq-keys";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
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

  describe("the head size", () => {
    function headHeight(head: HTMLElement, height: number): void {
      head.getBoundingClientRect = () => ({ height }) as DOMRect;
    }

    function mountInAside(height: number): {
      aside: HTMLElement;
      head: HTMLElement;
      unmount: () => void;
    } {
      document.body.innerHTML = [
        '<div class="vk-faq-aside"><div class="vk-section-head-aside"></div>',
        '<div id="faq-list"><details data-faq="a"><summary>a</summary></details></div>',
        '</div><div id="host"></div>',
      ].join("");
      const aside = document.querySelector<HTMLElement>(".vk-faq-aside") as HTMLElement;
      const head = aside.querySelector<HTMLElement>(".vk-section-head-aside") as HTMLElement;
      headHeight(head, height);
      const root = createRoot(document.getElementById("host") as HTMLElement);
      act(() => root.render(<FaqKeys listId="faq-list" />));
      return { aside, head, unmount: () => act(() => root.unmount()) };
    }

    it("puts the sticky head's height on the aside, follows its resizes and clears it on unmount", () => {
      const observed: Array<{ target: Element; callback: () => void }> = [];
      const disconnect = vi.fn();
      vi.stubGlobal(
        "ResizeObserver",
        class {
          constructor(private readonly callback: () => void) {}
          observe(target: Element) {
            observed.push({ target, callback: this.callback });
          }
          disconnect = disconnect;
        },
      );
      const { aside, head, unmount } = mountInAside(300);
      expect(aside.style.getPropertyValue(FAQ_HEAD_SIZE)).toBe("300px");
      expect(observed.map(({ target }) => target)).toEqual([head]);
      headHeight(head, 336);
      act(() => observed[0]?.callback());
      expect(aside.style.getPropertyValue(FAQ_HEAD_SIZE)).toBe("336px");
      unmount();
      expect(disconnect).toHaveBeenCalledOnce();
      expect(aside.style.getPropertyValue(FAQ_HEAD_SIZE)).toBe("");
    });

    it("measures once where ResizeObserver is missing", () => {
      vi.stubGlobal("ResizeObserver", undefined);
      const { aside, unmount } = mountInAside(280);
      expect(aside.style.getPropertyValue(FAQ_HEAD_SIZE)).toBe("280px");
      unmount();
      expect(aside.style.getPropertyValue(FAQ_HEAD_SIZE)).toBe("");
    });

    it("leaves a list outside the aside alone", () => {
      const { list, unmount } = mount();
      expect(list.hasAttribute(FAQ_KEYS_ATTACHED)).toBe(true);
      expect(document.body.innerHTML).not.toContain(FAQ_HEAD_SIZE);
      unmount();
    });
  });
});
