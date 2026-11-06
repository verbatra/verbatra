// @vitest-environment jsdom
import { act, type ReactNode, useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "./test-support.js";
import { useHorizontalOverflow } from "./use-horizontal-overflow.js";

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

function Probe(): ReactNode {
  const ref = useRef<HTMLDivElement>(null);
  const overflows = useHorizontalOverflow(ref);
  return (
    <div ref={ref} data-overflows={String(overflows)}>
      <span>child</span>
    </div>
  );
}

function widths(scroll: number, client: number): void {
  vi.spyOn(Element.prototype, "scrollWidth", "get").mockReturnValue(scroll);
  vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(client);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  FakeObserver.instances = [];
});

describe("useHorizontalOverflow", () => {
  it("reports false when the content fits", () => {
    widths(300, 300);

    const view = render(<Probe />);

    expect(view.get("[data-overflows]").dataset.overflows).toBe("false");
  });

  it("reports true when the content is wider than the box", () => {
    widths(600, 300);

    const view = render(<Probe />);

    expect(view.get("[data-overflows]").dataset.overflows).toBe("true");
  });

  it("re-measures when the observed box or its children resize, and stops on unmount", () => {
    vi.stubGlobal("ResizeObserver", FakeObserver);
    widths(300, 300);
    const view = render(<Probe />);
    const observer = FakeObserver.instances[0];

    expect(observer?.observed).toHaveLength(2);
    widths(600, 300);
    act(() => observer?.callback());
    expect(view.get("[data-overflows]").dataset.overflows).toBe("true");

    view.unmount();
    expect(observer?.disconnected).toBe(true);
  });
});
