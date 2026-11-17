// @vitest-environment jsdom

import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { report, reportPageview } from "@/lib/analytics-report";
import { AnalyticsReporter, forgetReportedPath } from "./analytics-reporter";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const navigation = vi.hoisted(() => ({ pathname: "/docs" }));

vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));
vi.mock("@/lib/analytics-report", () => ({ report: vi.fn(), reportPageview: vi.fn() }));

let mounted: { container: HTMLDivElement; root: Root } | undefined;

async function mount(strict = false): Promise<void> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      strict ? (
        <StrictMode>
          <AnalyticsReporter />
        </StrictMode>
      ) : (
        <AnalyticsReporter />
      ),
    );
  });
  mounted = { container, root };
}

async function navigateTo(pathname: string, strict = false): Promise<void> {
  navigation.pathname = pathname;
  await act(async () => {
    mounted?.root.render(
      strict ? (
        <StrictMode>
          <AnalyticsReporter />
        </StrictMode>
      ) : (
        <AnalyticsReporter />
      ),
    );
  });
}

beforeEach(() => {
  navigation.pathname = "/docs";
  forgetReportedPath();
});

afterEach(() => {
  if (mounted) {
    act(() => mounted?.root.unmount());
    mounted.container.remove();
    mounted = undefined;
  }
  document.body.innerHTML = "";
  vi.mocked(report).mockClear();
  vi.mocked(reportPageview).mockClear();
});

function clickButton(): void {
  const button = document.createElement("button");
  button.dataset.copySurface = "command-row";
  document.body.append(button);
  button.click();
}

describe("AnalyticsReporter: clicks", () => {
  it("renders no markup", () => {
    expect(renderToStaticMarkup(<AnalyticsReporter />)).toBe("");
  });

  it("reports a click anywhere in the page while mounted", async () => {
    await mount();
    clickButton();
    expect(report).toHaveBeenCalledExactlyOnceWith("copy_code", { surface: "command-row" });
  });

  it("stops reporting once unmounted", async () => {
    await mount();
    act(() => mounted?.root.unmount());
    mounted = undefined;
    clickButton();
    expect(report).not.toHaveBeenCalled();
  });

  it("ignores a click whose target is not an element", async () => {
    await mount();
    document.dispatchEvent(new Event("click"));
    expect(report).not.toHaveBeenCalled();
  });
});

describe("AnalyticsReporter: soft navigation", () => {
  it("does not report the first render, which the server already counted", async () => {
    await mount();
    expect(reportPageview).not.toHaveBeenCalled();
  });

  it("does not report the first render twice under strict mode either", async () => {
    await mount(true);
    expect(reportPageview).not.toHaveBeenCalled();
  });

  it("reports exactly one pageview for the new path after a pathname change", async () => {
    await mount();
    await navigateTo("/docs/cli");
    expect(reportPageview).toHaveBeenCalledExactlyOnceWith("/docs/cli");
  });

  it("reports one pageview per change under strict mode", async () => {
    await mount(true);
    await navigateTo("/docs/cli", true);
    expect(reportPageview).toHaveBeenCalledExactlyOnceWith("/docs/cli");
  });

  it("does not report a re-render on the same path", async () => {
    await mount();
    await navigateTo("/docs");
    expect(reportPageview).not.toHaveBeenCalled();
  });

  it("reports each later path once", async () => {
    await mount();
    await navigateTo("/docs/cli");
    await navigateTo("/docs/sdk");
    expect(vi.mocked(reportPageview).mock.calls).toEqual([["/docs/cli"], ["/docs/sdk"]]);
  });

  it("reports the new path when a locale switch remounts the reporter", async () => {
    await mount();
    act(() => mounted?.root.unmount());
    mounted?.container.remove();
    navigation.pathname = "/de/docs";
    await mount();
    expect(reportPageview).toHaveBeenCalledExactlyOnceWith("/de/docs");
  });

  it("does not report a remount on the same path", async () => {
    await mount();
    act(() => mounted?.root.unmount());
    mounted?.container.remove();
    await mount();
    expect(reportPageview).not.toHaveBeenCalled();
  });
});
