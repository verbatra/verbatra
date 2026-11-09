// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "./test-support.js";
import { useRunHistoryRefreshOnFocus } from "./use-run-history-refresh-on-focus.js";

function Probe({ onRefresh }: { readonly onRefresh: () => void }): ReactNode {
  useRunHistoryRefreshOnFocus(onRefresh);
  return null;
}

function setVisibility(state: "visible" | "hidden"): void {
  Object.defineProperty(document, "visibilityState", { configurable: true, value: state });
}

afterEach(() => {
  setVisibility("visible");
  vi.useRealTimers();
});

describe("useRunHistoryRefreshOnFocus", () => {
  it("asks for a re-read when the window regains focus while the tab is visible", () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    const onRefresh = vi.fn();
    render(<Probe onRefresh={onRefresh} />);

    act(() => {
      window.dispatchEvent(new Event("focus"));
    });

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("asks on a return to a visible tab, and not while the tab is hidden", () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    const onRefresh = vi.fn();
    render(<Probe onRefresh={onRefresh} />);

    setVisibility("hidden");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(onRefresh).not.toHaveBeenCalled();

    setVisibility("visible");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("collapses the focus and visibility events of one tab switch into one re-read", () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    const onRefresh = vi.fn();
    render(<Probe onRefresh={onRefresh} />);

    act(() => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("calls the latest callback and stops listening once unmounted", () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    const first = vi.fn();
    const second = vi.fn();
    const view = render(<Probe onRefresh={first} />);
    view.rerender(<Probe onRefresh={second} />);

    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    view.unmount();
    vi.setSystemTime(200_000);
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
