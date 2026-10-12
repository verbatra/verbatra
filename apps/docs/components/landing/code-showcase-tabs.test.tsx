// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";

vi.mock("@/lib/umami", () => ({ trackUmamiEvent: vi.fn() }));

vi.mock("motion/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("motion/react")>()),
  useReducedMotion: () => true,
}));

vi.mock("next-intl", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-intl")>();
  const { default: messages } = await import("@/messages/en.json");
  return {
    ...actual,
    useTranslations: (namespace: string) =>
      actual.createTranslator({ locale: "en", messages, namespace: namespace as never }),
  };
});

const features = vi.hoisted(() => ({ loads: 0 }));

vi.mock("@/components/motion-provider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/motion-provider")>();
  return {
    ...actual,
    loadMotionFeatures: () => {
      features.loads += 1;
      return actual.loadMotionFeatures();
    },
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
    await import("@/lib/motion-features");
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

describe("CodeShowcaseTabs", () => {
  it("loads the motion features only once the visitor reaches for the tabs", async () => {
    const container = mount([
      { id: "a", label: "A", panel: <p>first</p> },
      { id: "b", label: "B", panel: <p>second</p> },
    ]);
    await settle();
    expect(features.loads).toBe(0);
    const root = container.querySelector<HTMLElement>('[data-slot="tabs"]');
    await act(async () => {
      root?.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    });
    await settle();
    expect(features.loads).toBe(1);
  });

  it("keeps a panel's copy state and focus when the motion features arrive", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const container = mount([
      {
        id: "a",
        label: "A",
        panel: <CopyButton text="npx @verbatra/cli check" label="Copy" location="code" />,
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

  it("shows a newly selected panel at full opacity without a transition under reduced motion", async () => {
    const container = mount([
      { id: "a", label: "A", panel: <p>first</p> },
      { id: "b", label: "B", panel: <p>second</p> },
    ]);
    const second = container.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1];
    await act(async () => {
      second?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    });
    await settle();
    const panels = [...container.querySelectorAll<HTMLElement>('[role="tabpanel"]')];
    expect(panels.map((node) => node.dataset.state)).toEqual(["inactive", "active"]);
    const shown = panels[1]?.firstElementChild as HTMLElement | null;
    expect(shown?.style.opacity).toBe("1");
    expect(shown?.style.transform === "" || shown?.style.transform === "none").toBe(true);
  });

  it("keeps the animation features out of the tabs module itself", () => {
    const source = readFileSync(
      join(process.cwd(), "components/landing/code-showcase-tabs.tsx"),
      "utf8",
    );
    expect(source).not.toMatch(/domAnimation|domMax|motion-features/);
  });

  it("renders an empty tab list without throwing", () => {
    const container = mount([]);
    expect(container.querySelector('[role="tablist"]')?.children).toHaveLength(0);
  });
});
