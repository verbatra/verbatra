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
    tab?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
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
    const root = container.querySelector<HTMLElement>('[data-slot="tabs"]');
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
    const root = container.querySelector<HTMLElement>('[data-slot="tabs"]');
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

  it("renders an empty tab list without throwing", () => {
    const container = mount([]);
    expect(container.querySelector('[role="tablist"]')?.children).toHaveLength(0);
  });
});
