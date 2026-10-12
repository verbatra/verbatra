// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/umami", () => ({ trackUmamiEvent: vi.fn() }));

vi.mock("motion/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("motion/react")>()),
  useReducedMotion: () => true,
}));

const { CodeShowcaseTabs, loadMotionPanel } = await import("./code-showcase-tabs");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mount(tabs: Parameters<typeof CodeShowcaseTabs>[0]["tabs"]): HTMLDivElement {
  const container = document.createElement("div");
  document.body.append(container);
  act(() => createRoot(container).render(<CodeShowcaseTabs label="Ways" tabs={tabs} />));
  return container;
}

describe("CodeShowcaseTabs under reduced motion", () => {
  it("shows a newly selected panel at full opacity without a transition", async () => {
    const container = mount([
      { id: "a", label: "A", panel: <p>first</p> },
      { id: "b", label: "B", panel: <p>second</p> },
    ]);
    const second = container.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1];
    await act(async () => {
      second?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      await loadMotionPanel();
    });
    await act(async () => {
      second?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    const panels = [...container.querySelectorAll<HTMLElement>('[role="tabpanel"]')];
    expect(panels.map((node) => node.dataset.state)).toEqual(["inactive", "active"]);
    const shown = panels[1]?.firstElementChild as HTMLElement | null;
    expect(shown?.style.opacity).toBe("1");
    expect(shown?.style.transform === "" || shown?.style.transform === "none").toBe(true);
  });

  it("ships no motion code until the visitor reaches for the tabs, then animates with it", async () => {
    const container = mount([
      { id: "a", label: "A", panel: <p>first</p> },
      { id: "b", label: "B", panel: <p>second</p> },
    ]);
    const firstPanel = () =>
      container.querySelector<HTMLElement>('[role="tabpanel"]')?.firstElementChild as HTMLElement;
    expect(firstPanel().getAttribute("style")).toBeNull();
    const root = container.querySelector<HTMLElement>('[data-slot="tabs"]');
    await act(async () => {
      root?.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
      root?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      await loadMotionPanel();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(firstPanel().style.opacity).toBe("1");
  });

  it("keeps motion out of the tabs module itself", () => {
    const source = readFileSync(
      join(process.cwd(), "components/landing/code-showcase-tabs.tsx"),
      "utf8",
    );
    expect(source).not.toMatch(/from "motion\/react"|motion-provider/);
    expect(source).toContain('import("./code-showcase-motion")');
  });

  it("renders an empty tab list without throwing", () => {
    const container = mount([]);
    expect(container.querySelector('[role="tablist"]')?.children).toHaveLength(0);
  });
});
