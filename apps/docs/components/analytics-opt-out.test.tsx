// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UMAMI_OPT_OUT_KEY } from "@/lib/umami";
import { AnalyticsOptOut, type AnalyticsOptOutLabels } from "./analytics-opt-out";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LABELS: AnalyticsOptOutLabels = {
  optOut: "Opt out",
  optIn: "Opt in",
  statusPending: "Needs JavaScript",
  statusCounted: "Counted",
  statusOptedOut: "Opted out",
  statusDoNotTrack: "Do Not Track",
  statusUnavailable: "Unavailable",
};

let mounted: { container: HTMLDivElement; root: Root } | undefined;

function render(): HTMLDivElement {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(<AnalyticsOptOut labels={LABELS} />);
  });
  mounted = { container, root };
  return container;
}

function status(container: HTMLElement): string | null | undefined {
  return container.querySelector('[role="status"]')?.textContent;
}

function button(container: HTMLElement): HTMLButtonElement {
  const found = container.querySelector("button");
  if (!found) throw new Error("no button rendered");
  return found;
}

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  Reflect.deleteProperty(window.navigator, "doNotTrack");
  if (!mounted) return;
  const { container, root } = mounted;
  mounted = undefined;
  act(() => {
    root.unmount();
  });
  container.remove();
});

describe("AnalyticsOptOut", () => {
  it("renders a disabled control with the no-JavaScript status on the server", () => {
    const doc = new DOMParser().parseFromString(
      renderToStaticMarkup(<AnalyticsOptOut labels={LABELS} />),
      "text/html",
    );

    expect(status(doc.body)).toBe("Needs JavaScript");
    expect(button(doc.body).disabled).toBe(true);
  });

  it("shows that visits are counted when nothing opts out", () => {
    const container = render();

    expect(status(container)).toBe("Counted");
    expect(button(container).textContent).toBe("Opt out");
    expect(button(container).disabled).toBe(false);
  });

  it("writes the opt-out key on click and removes it on the next click", () => {
    const container = render();

    act(() => {
      button(container).click();
    });
    expect(window.localStorage.getItem(UMAMI_OPT_OUT_KEY)).toBe("1");
    expect(status(container)).toBe("Opted out");
    expect(button(container).textContent).toBe("Opt in");

    act(() => {
      button(container).click();
    });
    expect(window.localStorage.getItem(UMAMI_OPT_OUT_KEY)).toBeNull();
    expect(status(container)).toBe("Counted");
  });

  it("reflects an opt-out stored on an earlier visit", () => {
    window.localStorage.setItem(UMAMI_OPT_OUT_KEY, "1");

    const container = render();

    expect(status(container)).toBe("Opted out");
    expect(button(container).textContent).toBe("Opt in");
  });

  it("explains that Do Not Track already stops counting but still offers the opt-out", () => {
    Object.defineProperty(window.navigator, "doNotTrack", { configurable: true, value: "1" });

    const container = render();

    expect(status(container)).toBe("Do Not Track");
    expect(button(container).textContent).toBe("Opt out");
    expect(button(container).disabled).toBe(false);
  });

  it("disables the control when local storage is blocked", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });

    const container = render();

    expect(status(container)).toBe("Unavailable");
    expect(button(container).disabled).toBe(true);
  });
});
