// @vitest-environment jsdom
import { act, createRef, type RefObject } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScrollHint } from "./ScrollHint.js";
import { render } from "./test-support.js";

function sizes(element: Element | null, scrollWidth: number, clientWidth: number): void {
  if (element === null) {
    return;
  }
  Object.defineProperty(element, "scrollWidth", { value: scrollWidth, configurable: true });
  Object.defineProperty(element, "clientWidth", { value: clientWidth, configurable: true });
}

function mount(scrollWidth: number, clientWidth: number) {
  const ref: RefObject<HTMLDivElement | null> = createRef();
  const view = render(
    <div>
      <div
        data-card=""
        ref={(element) => {
          ref.current = element;
          sizes(element, scrollWidth, clientWidth);
        }}
      >
        <table />
      </div>
      <ScrollHint targetRef={ref} />
    </div>,
  );
  return { view, card: view.get("[data-card]") };
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
    const { view } = mount(900, 1000);
    const hint = view.get("p");

    expect(hint.hidden).toBe(true);
    expect(hint.getAttribute("aria-hidden")).toBe("true");
    expect(hint.textContent).toBe("Scroll sideways to see every column.");
  });

  it("shows at mount when the card is already wider than its visible area, at any width", () => {
    const { view } = mount(1200, 1000);

    expect(view.get("p").hidden).toBe(false);
  });

  it("stays hidden when the ref points at nothing", () => {
    const view = render(<ScrollHint targetRef={{ current: null }} />);

    expect(view.get("p").hidden).toBe(true);
  });

  it("re-measures when the card or the table inside it resizes, and stops on unmount", () => {
    vi.stubGlobal("ResizeObserver", FakeObserver);
    const { view, card } = mount(900, 1000);
    const observer = FakeObserver.instances[0];
    expect(observer?.observed).toEqual([card, card.firstElementChild]);
    expect(view.get("p").hidden).toBe(true);

    sizes(card, 1200, 1000);
    act(() => observer?.callback());
    expect(view.get("p").hidden).toBe(false);

    sizes(card, 900, 1000);
    act(() => observer?.callback());
    expect(view.get("p").hidden).toBe(true);

    view.unmount();
    expect(observer?.disconnected).toBe(true);
  });
});
