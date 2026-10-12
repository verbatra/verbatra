// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/umami", () => ({ trackUmamiEvent: vi.fn() }));

vi.mock("motion/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("motion/react")>()),
  useReducedMotion: () => true,
}));

const { CodeShowcaseTabs } = await import("./code-showcase-tabs");

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
      second?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    const panels = [...container.querySelectorAll<HTMLElement>('[role="tabpanel"]')];
    expect(panels.map((node) => node.dataset.state)).toEqual(["inactive", "active"]);
    const shown = panels[1]?.firstElementChild as HTMLElement | null;
    expect(shown?.style.opacity).toBe("1");
    expect(shown?.style.transform === "" || shown?.style.transform === "none").toBe(true);
  });

  it("renders an empty tab list without throwing", () => {
    const container = mount([]);
    expect(container.querySelector('[role="tablist"]')?.children).toHaveLength(0);
  });
});
