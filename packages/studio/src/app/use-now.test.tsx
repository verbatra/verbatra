// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "./test-support.js";
import { NOW_TICK_MS, useNow } from "./use-now.js";

function Clock({ ticking }: { readonly ticking: boolean }): ReactNode {
  return <span>{useNow(ticking)}</span>;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("useNow", () => {
  it("ticks once a second only while asked to", () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const view = render(<Clock ticking={false} />);
    expect(view.text()).toBe("10000");

    vi.setSystemTime(12_000);
    act(() => vi.advanceTimersByTime(NOW_TICK_MS));
    expect(view.text()).toBe("10000");

    view.rerender(<Clock ticking />);
    expect(view.text()).toBe(String(12_000 + NOW_TICK_MS));
    act(() => vi.advanceTimersByTime(NOW_TICK_MS));
    expect(view.text()).toBe(String(12_000 + 2 * NOW_TICK_MS));
  });
});
