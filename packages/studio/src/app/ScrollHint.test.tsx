// @vitest-environment jsdom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScrollHint } from "./ScrollHint.js";
import { render } from "./test-support.js";

function sizes(element: Element, scrollWidth: number, clientWidth: number): void {
  Object.defineProperty(element, "scrollWidth", { value: scrollWidth, configurable: true });
  Object.defineProperty(element, "clientWidth", { value: clientWidth, configurable: true });
}

function mount(scrollWidth: number, clientWidth: number) {
  const view = render(
    <div>
      <div data-card="">
        <table />
      </div>
      <ScrollHint />
    </div>,
  );
  const card = view.get("[data-card]");
  sizes(card, scrollWidth, clientWidth);
  return { view, card };
}

class FakeObserver {
  static instances: FakeObserver[] = [];
  observed: Element[] = [];
  disconnected = false;
  constructor(readonly callback: () => void) {
    FakeObserver.instances.push(this);
  }
  observe(element: Element): void {
    this.observed.push(element);
  }
  disconnect(): void {
    this.disconnected = true;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeObserver.instances = [];
});

describe("ScrollHint", () => {
  it("stays hidden, and out of the accessibility tree, when the table fits", () => {
    const view = render(
      <div>
        <div data-card="" />
        <ScrollHint />
      </div>,
    );
    const hint = view.get("p");

    expect(hint.hidden).toBe(true);
    expect(hint.getAttribute("aria-hidden")).toBe("true");
    expect(hint.textContent).toBe("Scroll sideways to see every column.");
  });

  it("stays hidden when there is nothing before it to measure", () => {
    const view = render(<ScrollHint />);

    expect(view.get("p").hidden).toBe(true);
  });

  it("shows once the table card is wider than its visible area, at any viewport width", () => {
    vi.stubGlobal("ResizeObserver", FakeObserver);
    const { view, card } = mount(1200, 1000);

    act(() => FakeObserver.instances[0]?.callback());

    expect(view.get("p").hidden).toBe(false);
    expect(FakeObserver.instances[0]?.observed).toContain(card);
    expect(FakeObserver.instances[0]?.observed).toContain(card.firstElementChild);
  });

  it("follows the card as it stops overflowing, and stops observing on unmount", () => {
    vi.stubGlobal("ResizeObserver", FakeObserver);
    const { view, card } = mount(1200, 1000);
    act(() => FakeObserver.instances[0]?.callback());
    expect(view.get("p").hidden).toBe(false);

    sizes(card, 900, 1000);
    act(() => FakeObserver.instances[0]?.callback());
    expect(view.get("p").hidden).toBe(true);

    view.unmount();
    expect(FakeObserver.instances[0]?.disconnected).toBe(true);
  });

  it("measures once where no resize observer exists", () => {
    const view = render(
      <div>
        <div data-card="" />
        <ScrollHint />
      </div>,
    );

    expect(view.get("p").hidden).toBe(true);
  });
});
