// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

type ScenarioModule = typeof import("@/lib/showcase-scenarios");

const loading = vi.hoisted(() => ({
  failuresLeft: 0,
  failRun: false,
}));

vi.mock("@/lib/showcase-scenarios", async (importOriginal) => {
  if (loading.failuresLeft > 0) {
    loading.failuresLeft -= 1;
    throw new Error("chunk failed to load");
  }
  const original = await importOriginal<ScenarioModule>();
  return {
    ...original,
    runShowcaseScenario: (id: Parameters<ScenarioModule["runShowcaseScenario"]>[0]) => {
      if (loading.failRun) throw new Error("scenario failed");
      return original.runShowcaseScenario(id);
    },
  };
});

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}));
const trackUmamiEvent = vi.hoisted(() => vi.fn());
vi.mock("@/lib/umami", () => ({ trackUmamiEvent }));

const actual = await vi.importActual<ScenarioModule>("@/lib/showcase-scenarios");
const { TryIt } = await import("./try-it");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { container: HTMLDivElement; root: Root } | undefined;

function render(): HTMLDivElement {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(<TryIt seed={actual.showcaseSeed()} rows={actual.showcaseRows()} />);
  });
  mounted = { container, root };
  return container;
}

function button(container: HTMLElement, label: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll("button")].find((node) => node.textContent === label);
}

const SETTLE_TICKS = 500;

function busy(): boolean {
  return document.querySelector('[role="status"][aria-busy="true"]') !== null;
}

async function settle(): Promise<void> {
  for (let tick = 0; tick < SETTLE_TICKS; tick += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    if (!busy()) return;
  }
  throw new Error("the scenario load never settled");
}

async function click(target: Element | null | undefined): Promise<void> {
  await act(async () => {
    target?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await settle();
}

function title(container: HTMLElement): string | null | undefined {
  return container.querySelector(".vk-showcase-result-title")?.textContent;
}

afterEach(() => {
  if (mounted) {
    const { container, root } = mounted;
    act(() => root.unmount());
    container.remove();
    mounted = undefined;
  }
});

describe("TryIt: loading the scenario module", () => {
  it("announces a failed load, forgets it, and runs the scenario on retry", async () => {
    loading.failuresLeft = 1;
    const container = render();
    expect(button(container, "landing.showcase.tryIt.retry")).toBeUndefined();

    await click(button(container, "landing.showcase.tryIt.scenarios.edit"));
    const status = container.querySelector('[role="status"]');
    expect(status?.hasAttribute("aria-busy")).toBe(false);
    expect(title(container)).toBe("landing.showcase.tryIt.result.failed");
    expect(status?.contains(container.querySelector("[data-failed]") ?? null)).toBe(true);
    expect(loading.failuresLeft).toBe(0);

    trackUmamiEvent.mockReset();
    await click(button(container, "landing.showcase.tryIt.retry"));
    expect(trackUmamiEvent.mock.calls).toEqual([
      ["run-scenario", { scenario: "edit", location: "showcase", retry: true }],
    ]);
    expect(title(container)).toBe("landing.showcase.tryIt.result.headline");
    expect(container.querySelector('[data-mark="edited"]')).not.toBeNull();
    expect(button(container, "landing.showcase.tryIt.retry")).toBeUndefined();
  });

  it("clears the pressed scenario while a failure is shown", async () => {
    const container = render();
    await click(button(container, "landing.showcase.tryIt.scenarios.edit"));
    const pressed = () => container.querySelectorAll('.vk-showcase-scenario[aria-pressed="true"]');
    expect(pressed()).toHaveLength(1);
    loading.failRun = true;
    await click(button(container, "landing.showcase.tryIt.scenarios.add"));
    loading.failRun = false;
    expect(title(container)).toBe("landing.showcase.tryIt.result.failed");
    expect(pressed()).toHaveLength(0);
  });
});
