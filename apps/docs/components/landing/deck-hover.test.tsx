// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DECK_HOVER_ATTACHED, DECK_HOVER_DWELL_MS, DeckHover } from "./deck-hover";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Listener = () => void;

function stubMedia(matching: Record<string, boolean>): Map<string, Set<Listener>> {
  const listeners = new Map<string, Set<Listener>>();
  vi.stubGlobal("matchMedia", (query: string) => {
    const set = listeners.get(query) ?? new Set<Listener>();
    listeners.set(query, set);
    return {
      get matches() {
        return matching[query] ?? false;
      },
      addEventListener: (_: string, listener: Listener) => set.add(listener),
      removeEventListener: (_: string, listener: Listener) => set.delete(listener),
    };
  });
  return listeners;
}

const FINE = "(hover: hover) and (pointer: fine)";
const WIDE = "(min-width: 64rem)";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function mount(deckId = "deck"): { deck: HTMLElement; unmount: () => void } {
  document.body.innerHTML = [
    '<ol id="deck">',
    ...["a", "b", "c"].map(
      (id, index) =>
        `<li><div class="vk-deck-row" data-row="${id}"><input type="radio" name="g" id="r-${id}" class="vk-deck-radio"${index === 0 ? " checked" : ""}><label for="r-${id}">${id}</label></div><a class="vk-deck-link" href="#${id}">link</a></li>`,
    ),
    '</ol><div id="host"></div>',
  ].join("");
  const root = createRoot(document.getElementById("host") as HTMLElement);
  act(() => root.render(<DeckHover deckId={deckId} />));
  return {
    deck: document.getElementById("deck") as HTMLElement,
    unmount: () => act(() => root.unmount()),
  };
}

function row(id: string): HTMLElement {
  return document.querySelector(`[data-row="${id}"]`) as HTMLElement;
}

function radio(id: string): HTMLInputElement {
  return document.getElementById(`r-${id}`) as HTMLInputElement;
}

function move(
  target: Element,
  x: number,
  y: number,
  pointerType = "mouse",
  movement: { movementX: number; movementY: number } = { movementX: 3, movementY: 2 },
): void {
  const event = new Event("pointermove", { bubbles: true });
  Object.assign(event, { clientX: x, clientY: y, pointerType, ...movement });
  target.dispatchEvent(event);
}

function moveWithoutMovement(target: Element, x: number, y: number): void {
  move(target, x, y, "mouse", { movementX: 0, movementY: 0 });
}

function leave(target: Element, pointerType = "mouse", relatedTarget: Element | null = null): void {
  const event = new Event("pointerout", { bubbles: true });
  Object.assign(event, { pointerType, relatedTarget });
  target.dispatchEvent(event);
}

describe("DeckHover", () => {
  it("attaches no listener without a fine pointer at 64rem and up", () => {
    stubMedia({ [FINE]: true, [WIDE]: false });
    const { deck, unmount } = mount();
    expect(deck.hasAttribute(DECK_HOVER_ATTACHED)).toBe(false);
    move(row("b"), 1, 1);
    vi.advanceTimersByTime(DECK_HOVER_DWELL_MS * 2);
    expect(radio("a").checked).toBe(true);
    unmount();
  });

  it("checks a row's radio after the dwell that follows a real move", () => {
    stubMedia({ [FINE]: true, [WIDE]: true });
    const { deck, unmount } = mount();
    expect(deck.hasAttribute(DECK_HOVER_ATTACHED)).toBe(true);
    const changes = vi.fn();
    deck.addEventListener("change", changes);
    move(row("b"), 10, 10);
    vi.advanceTimersByTime(DECK_HOVER_DWELL_MS - 1);
    expect(radio("b").checked).toBe(false);
    vi.advanceTimersByTime(1);
    expect(radio("b").checked).toBe(true);
    expect(radio("a").checked).toBe(false);
    expect(changes).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("cancels when the pointer leaves the row before the dwell ends", () => {
    stubMedia({ [FINE]: true, [WIDE]: true });
    const { unmount } = mount();
    move(row("b"), 10, 10);
    vi.advanceTimersByTime(DECK_HOVER_DWELL_MS - 20);
    leave(row("b"));
    vi.advanceTimersByTime(DECK_HOVER_DWELL_MS);
    expect(radio("b").checked).toBe(false);
    unmount();
  });

  it("keeps the dwell when the pointer crosses descendants of the same row", () => {
    stubMedia({ [FINE]: true, [WIDE]: true });
    const { unmount } = mount();
    move(row("b"), 10, 10);
    vi.advanceTimersByTime(DECK_HOVER_DWELL_MS - 20);
    leave(document.querySelector('label[for="r-b"]') as Element, "mouse", radio("b"));
    vi.advanceTimersByTime(20);
    expect(radio("b").checked).toBe(true);
    unmount();
  });

  it("cancels when the pointer leaves the deck and keeps the last selection", () => {
    stubMedia({ [FINE]: true, [WIDE]: true });
    const { deck, unmount } = mount();
    move(row("b"), 10, 10);
    vi.advanceTimersByTime(DECK_HOVER_DWELL_MS);
    move(row("c"), 20, 20);
    deck.dispatchEvent(new Event("pointerleave"));
    vi.advanceTimersByTime(DECK_HOVER_DWELL_MS * 2);
    expect(radio("b").checked).toBe(true);
    expect(radio("c").checked).toBe(false);
    unmount();
  });

  it("restarts the dwell for a new row and ignores a pointer over the pane link", () => {
    stubMedia({ [FINE]: true, [WIDE]: true });
    const { unmount } = mount();
    move(row("b"), 10, 10);
    vi.advanceTimersByTime(DECK_HOVER_DWELL_MS - 20);
    move(row("c"), 20, 20);
    vi.advanceTimersByTime(DECK_HOVER_DWELL_MS - 20);
    expect(radio("b").checked).toBe(false);
    expect(radio("c").checked).toBe(false);
    move(document.querySelector(".vk-deck-link") as Element, 30, 30);
    vi.advanceTimersByTime(DECK_HOVER_DWELL_MS * 2);
    expect(radio("a").checked).toBe(true);
    unmount();
  });

  it("ignores touch and pen pointers", () => {
    stubMedia({ [FINE]: true, [WIDE]: true });
    const { unmount } = mount();
    move(row("b"), 10, 10, "touch");
    move(row("b"), 12, 12, "pen");
    vi.advanceTimersByTime(DECK_HOVER_DWELL_MS * 2);
    expect(radio("b").checked).toBe(false);
    leave(row("b"), "touch");
    unmount();
  });

  it("ignores a move that carries no movement, such as a scroll under the cursor", () => {
    stubMedia({ [FINE]: true, [WIDE]: true });
    const { unmount } = mount();
    move(row("a"), 10, 10);
    vi.advanceTimersByTime(DECK_HOVER_DWELL_MS);
    moveWithoutMovement(row("b"), 10, 10);
    vi.advanceTimersByTime(DECK_HOVER_DWELL_MS * 2);
    expect(radio("b").checked).toBe(false);
    unmount();
  });

  it("ignores the first move over the deck when the pointer started outside it and the page scrolled", () => {
    stubMedia({ [FINE]: true, [WIDE]: true });
    const { unmount } = mount();
    moveWithoutMovement(row("c"), 400, 300);
    vi.advanceTimersByTime(DECK_HOVER_DWELL_MS * 2);
    expect(radio("c").checked).toBe(false);
    move(row("c"), 401, 300);
    vi.advanceTimersByTime(DECK_HOVER_DWELL_MS);
    expect(radio("c").checked).toBe(true);
    unmount();
  });

  it("keeps the dwell running while the pointer crosses from one child of the row to another", () => {
    stubMedia({ [FINE]: true, [WIDE]: true });
    const { unmount } = mount();
    move(row("b"), 10, 10);
    vi.advanceTimersByTime(DECK_HOVER_DWELL_MS - 20);
    leave(
      document.querySelector('label[for="r-b"]') as Element,
      "mouse",
      document.getElementById("r-b"),
    );
    vi.advanceTimersByTime(20);
    expect(radio("b").checked).toBe(true);
    unmount();
  });

  it("cancels when the pointer moves from the row to a sibling row", () => {
    stubMedia({ [FINE]: true, [WIDE]: true });
    const { unmount } = mount();
    move(row("b"), 10, 10);
    vi.advanceTimersByTime(DECK_HOVER_DWELL_MS - 20);
    leave(row("b"), "mouse", row("c"));
    vi.advanceTimersByTime(DECK_HOVER_DWELL_MS);
    expect(radio("b").checked).toBe(false);
    unmount();
  });

  it("never moves focus", () => {
    stubMedia({ [FINE]: true, [WIDE]: true });
    const { unmount } = mount();
    radio("a").focus();
    const matches = Element.prototype.matches;
    vi.spyOn(Element.prototype, "matches").mockImplementation(function (
      this: Element,
      selector: string,
    ) {
      return selector === ":focus-visible" ? false : matches.call(this, selector);
    });
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    move(row("c"), 10, 10);
    vi.advanceTimersByTime(DECK_HOVER_DWELL_MS);
    expect(radio("c").checked).toBe(true);
    expect(focus).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(radio("a"));
    unmount();
  });

  it("skips while a deck radio shows keyboard focus", () => {
    stubMedia({ [FINE]: true, [WIDE]: true });
    const { unmount } = mount();
    const matches = Element.prototype.matches;
    vi.spyOn(Element.prototype, "matches").mockImplementation(function (
      this: Element,
      selector: string,
    ) {
      return selector === ":focus-visible" ? this === radio("a") : matches.call(this, selector);
    });
    move(row("b"), 10, 10);
    vi.advanceTimersByTime(DECK_HOVER_DWELL_MS);
    expect(radio("b").checked).toBe(false);
    unmount();
  });

  it("follows the media queries as they change", () => {
    const matching = { [FINE]: true, [WIDE]: false };
    const listeners = stubMedia(matching);
    const { deck, unmount } = mount();
    expect(deck.hasAttribute(DECK_HOVER_ATTACHED)).toBe(false);
    matching[WIDE] = true;
    act(() => {
      for (const listener of listeners.get(WIDE) ?? []) listener();
    });
    expect(deck.hasAttribute(DECK_HOVER_ATTACHED)).toBe(true);
    move(row("b"), 10, 10);
    matching[WIDE] = false;
    act(() => {
      for (const listener of listeners.get(WIDE) ?? []) listener();
    });
    expect(deck.hasAttribute(DECK_HOVER_ATTACHED)).toBe(false);
    vi.advanceTimersByTime(DECK_HOVER_DWELL_MS * 2);
    expect(radio("b").checked).toBe(false);
    unmount();
  });

  it("cleans up its listeners, timer and media subscriptions on unmount", () => {
    const listeners = stubMedia({ [FINE]: true, [WIDE]: true });
    const { deck, unmount } = mount();
    move(row("b"), 10, 10);
    unmount();
    expect(deck.hasAttribute(DECK_HOVER_ATTACHED)).toBe(false);
    vi.advanceTimersByTime(DECK_HOVER_DWELL_MS * 2);
    expect(radio("b").checked).toBe(false);
    expect(listeners.get(FINE)?.size).toBe(0);
    expect(listeners.get(WIDE)?.size).toBe(0);
  });

  it("does nothing when the deck is missing", () => {
    stubMedia({ [FINE]: true, [WIDE]: true });
    const { deck, unmount } = mount("missing");
    expect(deck.hasAttribute(DECK_HOVER_ATTACHED)).toBe(false);
    unmount();
  });
});
