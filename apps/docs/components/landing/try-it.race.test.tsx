// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

type ScenarioModule = typeof import("@/lib/showcase-scenarios");

const loading = vi.hoisted(() => {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { gate, release: () => release() };
});

vi.mock("@/lib/showcase-scenarios", async (importOriginal) => {
  await loading.gate;
  return importOriginal<ScenarioModule>();
});
vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}));
vi.mock("@/lib/umami", () => ({ trackUmamiEvent: vi.fn() }));

const actual = await vi.importActual<ScenarioModule>("@/lib/showcase-scenarios");
const { TryIt } = await import("./try-it");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { container: HTMLDivElement; root: Root } | undefined;

afterEach(() => {
  if (mounted) {
    const { container, root } = mounted;
    act(() => root.unmount());
    container.remove();
    mounted = undefined;
  }
});

function button(container: HTMLElement, label: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll("button")].find((node) => node.textContent === label);
}

async function click(target: Element | null | undefined): Promise<void> {
  await act(async () => {
    target?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

describe("TryIt: a break chosen while the module is still loading", () => {
  it("shows the chosen reply checked before its run resolves", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(<TryIt seed={actual.showcaseSeed()} rows={actual.showcaseRows()} />);
    });
    mounted = { container, root };

    await click(container.querySelector<HTMLInputElement>('input[value="drop"]'));
    const checked = [...container.querySelectorAll<HTMLInputElement>('input[type="radio"]')]
      .filter((radio) => radio.checked)
      .map((radio) => radio.value);
    expect(checked).toEqual(["drop"]);
    expect(container.querySelector('[role="status"]')?.getAttribute("aria-busy")).toBe("true");
  });
});

describe("TryIt: a Reset while the module is still loading", () => {
  it("keeps the seed once the pending load resolves", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(<TryIt seed={actual.showcaseSeed()} rows={actual.showcaseRows()} />);
    });
    mounted = { container, root };
    const reset = () => button(container, "landing.showcase.tryIt.reset");

    expect(reset()?.hidden).toBe(true);
    await click(button(container, "landing.showcase.tryIt.scenarios.add"));
    expect(container.querySelector(".vk-showcase-result-title")?.textContent).toBe(
      "landing.showcase.tryIt.result.seed",
    );
    expect(reset()?.hidden).toBe(false);
    await click(reset());
    await act(async () => {
      loading.release();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(container.querySelector(".vk-showcase-result-title")?.textContent).toBe(
      "landing.showcase.tryIt.result.seed",
    );
    expect(container.querySelectorAll("[data-mark]")).toHaveLength(0);
    expect(reset()?.hidden).toBe(true);
  });
});
