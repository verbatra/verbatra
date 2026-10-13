// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";

const motion = vi.hoisted(() => ({ loads: 0, fades: [] as HTMLElement[] }));

vi.mock("./code-showcase-fade", () => {
  motion.loads += 1;
  return { fadeInPanel: (element: HTMLElement) => motion.fades.push(element) };
});

vi.mock("next-intl", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-intl")>();
  const { default: messages } = await import("@/messages/en.json");
  return {
    ...actual,
    useTranslations: (namespace: string) =>
      actual.createTranslator({ locale: "en", messages, namespace: namespace as never }),
  };
});

const { CodeShowcaseTabs } = await import("./code-showcase-tabs");
const { CopyButton } = await import("@/components/ui/copy-button");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mount(tabs: Parameters<typeof CodeShowcaseTabs>[0]["tabs"]): HTMLDivElement {
  const container = document.createElement("div");
  document.body.append(container);
  act(() => createRoot(container).render(<CodeShowcaseTabs label="Ways" tabs={tabs} />));
  return container;
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

function selectTab(container: HTMLElement, index: number): void {
  const tab = container.querySelectorAll<HTMLButtonElement>('[role="tab"]')[index];
  act(() => {
    tab?.click();
  });
}

describe("CodeShowcaseTabs", () => {
  it("loads the fade only once the visitor reaches for the tabs", async () => {
    const container = mount([
      { id: "a", label: "A", panel: <p>first</p> },
      { id: "b", label: "B", panel: <p>second</p> },
    ]);
    await settle();
    expect(motion.loads).toBe(0);
    const root = container.firstElementChild;
    await act(async () => {
      root?.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    });
    await settle();
    expect(motion.loads).toBe(1);
  });

  it("fades in a newly selected panel, and never the one already open", async () => {
    motion.fades.length = 0;
    const container = mount([
      { id: "a", label: "A", panel: <p>first</p> },
      { id: "b", label: "B", panel: <p>second</p> },
    ]);
    selectTab(container, 1);
    await settle();
    const panels = [...container.querySelectorAll<HTMLElement>('[role="tabpanel"]')];
    expect(motion.fades).toEqual([panels[1]?.firstElementChild]);
  });

  it("keeps a panel's copy state and focus when the fade arrives", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const container = mount([
      {
        id: "a",
        label: "A",
        panel: <CopyButton text="npx @verbatra/cli check" label="Copy" />,
      },
      { id: "b", label: "B", panel: <p>second</p> },
    ]);
    const copy = container.querySelector<HTMLButtonElement>('[role="tabpanel"] button');
    await act(async () => copy?.click());
    copy?.focus();
    expect(copy?.textContent).toBe(en.landing.install.copied);
    const root = container.firstElementChild;
    await act(async () => {
      root?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    });
    await settle();
    const after = container.querySelector<HTMLButtonElement>('[role="tabpanel"] button');
    expect(after).toBe(copy);
    expect(document.activeElement).toBe(copy);
    expect(after?.textContent).toBe(en.landing.install.copied);
  });

  it("leaves the reduced motion check to the fade, so the tabs module never reads it", () => {
    const source = readFileSync(
      join(process.cwd(), "components/landing/code-showcase-tabs.tsx"),
      "utf8",
    );
    expect(source).not.toContain("reduced-motion");
  });

  it("keeps motion out of the tabs module, which renders one plain element per panel", () => {
    const source = readFileSync(
      join(process.cwd(), "components/landing/code-showcase-tabs.tsx"),
      "utf8",
    );
    expect(source).not.toMatch(/from "motion/);
    expect(source).toContain('import("./code-showcase-fade")');
  });

  it("wires every tab to its panel, keeps panels focusable and moves selection with the arrow keys", () => {
    const container = mount([
      { id: "a", label: "A", panel: <p>first</p> },
      { id: "b", label: "B", panel: <p>second</p> },
    ]);
    const tabs = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    const panels = [...container.querySelectorAll<HTMLElement>('[role="tabpanel"]')];
    tabs.forEach((tab, index) => {
      expect(tab.getAttribute("aria-controls")).toBe(panels[index]?.id);
      expect(panels[index]?.getAttribute("aria-labelledby")).toBe(tab.id);
      expect(panels[index]?.tabIndex).toBe(0);
      expect(tab.className).toContain("min-h-11");
    });
    expect(panels.map((panel) => panel.dataset.active)).toEqual(["true", "false"]);
    act(() => {
      tabs[0]?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    expect(document.activeElement).toBe(tabs[1]);
    expect(tabs.map((tab) => tab.getAttribute("aria-selected"))).toEqual(["false", "true"]);
    expect(panels.map((panel) => panel.dataset.active)).toEqual(["false", "true"]);
  });

  it("derives its ids from useId, so two showcases on one page never share a tab or panel id", () => {
    const tabs = [
      { id: "a", label: "A", panel: <p>first</p> },
      { id: "b", label: "B", panel: <p>second</p> },
    ];
    const first = mount(tabs);
    const second = mount(tabs);
    const ids = [first, second].flatMap((container) =>
      [...container.querySelectorAll<HTMLElement>('[role="tab"], [role="tabpanel"]')].map(
        (element) => element.id,
      ),
    );
    expect(ids).toHaveLength(8);
    expect(new Set(ids).size).toBe(8);
    for (const id of ids) {
      expect(id.startsWith("code-showcase")).toBe(true);
      expect(document.getElementById(id)?.id).toBe(id);
    }
    const tab = second.querySelector<HTMLElement>('[role="tab"]');
    const panel = document.getElementById(tab?.getAttribute("aria-controls") ?? "");
    expect(second.contains(panel)).toBe(true);
  });

  it("renders an empty tab list without throwing", () => {
    const container = mount([]);
    expect(container.querySelector('[role="tablist"]')?.children).toHaveLength(0);
  });
});
