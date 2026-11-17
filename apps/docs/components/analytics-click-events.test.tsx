// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnalyticsClickEvents } from "./analytics-click-events";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { container: HTMLDivElement; root: Root } | undefined;

async function mount(): Promise<void> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<AnalyticsClickEvents />);
  });
  mounted = { container, root };
}

afterEach(() => {
  if (mounted) {
    act(() => mounted?.root.unmount());
    mounted.container.remove();
    mounted = undefined;
  }
  document.body.innerHTML = "";
  Reflect.deleteProperty(window, "umami");
});

function clickButton(): void {
  const button = document.createElement("button");
  button.dataset.copySurface = "command-row";
  document.body.append(button);
  button.click();
}

describe("AnalyticsClickEvents", () => {
  it("renders no markup", () => {
    expect(renderToStaticMarkup(<AnalyticsClickEvents />)).toBe("");
  });

  it("reports a click anywhere in the page while mounted", async () => {
    const track = vi.fn();
    Reflect.set(window, "umami", { track });
    await mount();
    clickButton();
    expect(track).toHaveBeenCalledExactlyOnceWith("copy_code", { surface: "command-row" });
  });

  it("is harmless without a tracker", async () => {
    await mount();
    expect(clickButton).not.toThrow();
  });

  it("stops reporting once unmounted", async () => {
    const track = vi.fn();
    Reflect.set(window, "umami", { track });
    await mount();
    act(() => mounted?.root.unmount());
    mounted = undefined;
    clickButton();
    expect(track).not.toHaveBeenCalled();
  });

  it("ignores a click whose target is not an element", async () => {
    const track = vi.fn();
    Reflect.set(window, "umami", { track });
    await mount();
    document.dispatchEvent(new Event("click"));
    expect(track).not.toHaveBeenCalled();
  });
});
