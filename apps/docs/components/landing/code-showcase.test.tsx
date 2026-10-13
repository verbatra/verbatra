// @vitest-environment jsdom

import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { LANDING_SHOWCASE_CODE, LANDING_SHOWCASE_TABS } from "@/lib/landing-code";
import en from "@/messages/en.json";
import { preloadRegisteredIslands } from "@/test-support/islands";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const { default: messages } = await import("@/messages/en.json");
  return {
    getTranslations: async (namespace: string) =>
      createTranslator({ locale: "en", messages, namespace: namespace as never }),
    getLocale: async () => "fr",
  };
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

const { CodeShowcase, CODE_SHOWCASE_PAGES } = await import("./code-showcase");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

await preloadRegisteredIslands();

let node: Awaited<ReturnType<typeof CodeShowcase>>;
let mounted: { container: HTMLDivElement; root: Root } | undefined;

beforeAll(async () => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
    }),
  });
  node = await CodeShowcase();
});

afterEach(() => {
  if (mounted) act(() => mounted?.root.unmount());
  mounted?.container.remove();
  mounted = undefined;
});

function mount(): HTMLDivElement {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(node));
  mounted = { container, root };
  return container;
}

function tabs(container: HTMLElement): HTMLButtonElement[] {
  return [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
}

function panel(container: HTMLElement, id: string): HTMLElement {
  const found = container
    .querySelector<HTMLElement>(`[data-panel="${id}"]`)
    ?.closest<HTMLElement>('[role="tabpanel"]');
  if (!found) throw new Error(`no ${id} panel`);
  return found;
}

async function press(target: HTMLElement, key: string): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("CodeShowcase on the server", () => {
  it("renders every panel with dual-theme highlighted code and no inline script", () => {
    const container = document.createElement("div");
    container.innerHTML = renderToString(node);
    expect(container.querySelector("h2#code-heading")?.textContent).toBe(en.landing.code.heading);
    for (const id of LANDING_SHOWCASE_TABS) {
      const pre = panel(container, id).querySelector("pre.shiki");
      expect(pre?.className).toContain("github-light github-dark");
      expect(pre?.innerHTML).toMatch(/--shiki-light:#[0-9a-f]{6};--shiki-dark:#[0-9a-f]{6}/i);
      expect(pre?.textContent).toBe(LANDING_SHOWCASE_CODE[id].code.replace(/\n+$/, ""));
    }
    expect(container.querySelector("script")).toBeNull();
    expect(container.innerHTML).not.toMatch(/\son[a-z]+="/i);
  });

  it("marks only the first panel active and keeps the others in the document out of the layout", () => {
    const container = document.createElement("div");
    container.innerHTML = renderToString(node);
    const states = LANDING_SHOWCASE_TABS.map((id) => panel(container, id).dataset.state);
    expect(states).toEqual(["active", "inactive", "inactive", "inactive"]);
    for (const id of LANDING_SHOWCASE_TABS) {
      expect(panel(container, id).hidden).toBe(false);
      expect(panel(container, id).className).toContain("data-[state=inactive]:hidden");
      expect(panel(container, id).className).not.toContain("[grid-area:1/1]");
      expect(panel(container, id).className).not.toContain("invisible");
    }
  });
});

describe("CodeShowcase tabs", () => {
  it("labels the tab list and every tab from en.json", () => {
    const container = mount();
    expect(container.querySelector('[role="tablist"]')?.getAttribute("aria-label")).toBe(
      en.landing.code.tablist,
    );
    expect(tabs(container).map((tab) => tab.textContent)).toEqual(
      LANDING_SHOWCASE_TABS.map((id) => en.landing.code.tabs[id]),
    );
  });

  it("uses a roving tabindex and moves selection with the arrow keys, Home and End", async () => {
    const container = mount();
    const [first, second, , last] = tabs(container);
    if (!first || !second || !last) throw new Error("tabs missing");
    expect(container.querySelector<HTMLElement>('[role="tablist"]')?.tabIndex).toBe(0);
    act(() => first.focus());
    expect(tabs(container).map((tab) => tab.tabIndex)).toEqual([0, -1, -1, -1]);
    await press(first, "ArrowRight");
    expect(document.activeElement).toBe(second);
    expect(second.getAttribute("aria-selected")).toBe("true");
    expect(panel(container, "sdk").dataset.state).toBe("active");
    expect(panel(container, "cli").dataset.state).toBe("inactive");
    await press(second, "End");
    expect(document.activeElement).toBe(last);
    await press(last, "ArrowRight");
    expect(document.activeElement).toBe(first);
    await press(first, "ArrowLeft");
    expect(document.activeElement).toBe(last);
    await press(last, "Home");
    expect(document.activeElement).toBe(first);
  });

  it("selects a tab on click and links its docs page in the page locale", () => {
    const container = mount();
    const action = tabs(container)[3];
    act(() => {
      action?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    });
    expect(action?.getAttribute("aria-selected")).toBe("true");
    const link = panel(container, "action").querySelector("a");
    expect(link?.getAttribute("href")).toBe(`/fr${CODE_SHOWCASE_PAGES.action}`);
    expect(link?.textContent).toBe(en.landing.code.links.action);
  });

  it("copies the raw code of the open tab", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const container = mount();
    const button = panel(container, "config").querySelector("button");
    expect(button?.getAttribute("aria-label")).toBe(en.landing.code.copy);
    await act(async () => button?.click());
    expect(writeText).toHaveBeenCalledWith(LANDING_SHOWCASE_CODE.config.code);
  });

  it("captions each file sample with its file name", () => {
    const container = mount();
    for (const id of LANDING_SHOWCASE_TABS) {
      const caption = panel(container, id).querySelector("figcaption")?.textContent;
      expect(caption).toBe(LANDING_SHOWCASE_CODE[id].filename);
    }
  });
});
