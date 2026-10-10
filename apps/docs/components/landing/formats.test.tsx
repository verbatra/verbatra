// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FORMAT_SAMPLES } from "@/lib/format-samples";
import { FORMAT_DISPLAY, SUPPORTED_FORMAT_IDS } from "@/lib/landing-facts";
import { STACK_FRAMEWORKS } from "@/lib/stack-formats";

const trackUmamiEvent = vi.hoisted(() => vi.fn());
vi.mock("@/lib/umami", () => ({ trackUmamiEvent }));

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
  getLocale: async () => "de",
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { Formats } = await import("./formats");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const GLOBAL_CSS = readFileSync(join(process.cwd(), "app/global.css"), "utf8");
const FLAT_CSS = GLOBAL_CSS.replace(/\s+/g, " ");
const SWITCH_SOURCE = readFileSync(
  join(process.cwd(), "components/landing/format-switch.tsx"),
  "utf8",
);

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\n)${escaped} \\{([^}]*)\\}`).exec(GLOBAL_CSS)?.[1] ?? "";
}

let mounted: { container: HTMLDivElement; root: Root } | undefined;

async function render(): Promise<HTMLDivElement> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const node = await Formats();
  act(() => {
    root.render(node);
  });
  mounted = { container, root };
  return container;
}

function tabs(container: HTMLElement): HTMLButtonElement[] {
  return [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
}

function panels(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('[role="tabpanel"]')];
}

function chips(container: HTMLElement): HTMLButtonElement[] {
  return [...container.querySelectorAll<HTMLButtonElement>(".vk-formats-chip")];
}

function activePanel(container: HTMLElement): HTMLElement | undefined {
  return panels(container).find((panel) => panel.dataset.active === "true");
}

beforeEach(() => {
  trackUmamiEvent.mockReset();
});

afterEach(() => {
  if (mounted) {
    const { container, root } = mounted;
    act(() => root.unmount());
    container.remove();
    mounted = undefined;
  }
});

describe("Formats", () => {
  it("is a landing section named by its heading, with a lead", async () => {
    const container = await render();
    const section = container.querySelector("section#formats");
    expect(section?.querySelector("h2")?.textContent).toBe("heading");
    expect(section?.querySelector("p.vk-lead")?.textContent).toBe("lead");
  });

  it("offers one tab per supported format, labelled from FORMAT_DISPLAY, with the first selected", async () => {
    const container = await render();
    expect(tabs(container).map((tab) => tab.textContent)).toEqual(
      SUPPORTED_FORMAT_IDS.map((id) => FORMAT_DISPLAY[id].label),
    );
    expect(container.querySelector('[role="tablist"]')?.getAttribute("aria-label")).toBe(
      "formatsLabel",
    );
    expect(tabs(container)[0]?.getAttribute("aria-selected")).toBe("true");
  });

  it("server-renders every pane with the adapter's real output and its file name", async () => {
    const container = await render();
    const all = panels(container);
    expect(all).toHaveLength(SUPPORTED_FORMAT_IDS.length);
    for (const [index, id] of SUPPORTED_FORMAT_IDS.entries()) {
      const panel = all[index];
      const sample = FORMAT_SAMPLES[id];
      expect(panel?.querySelector("figcaption")?.textContent).toBe(sample.file);
      expect(panel?.querySelector("pre")?.textContent).toBe(sample.text.replace(/\n$/, ""));
      expect(
        [...(panel?.querySelectorAll(".vk-placeholder") ?? [])].map((chip) => chip.textContent),
      ).toEqual([sample.placeholder]);
    }
  });

  it("keeps closed panes inert and hidden, stacked in one cell so the box is the tallest pane", async () => {
    const container = await render();
    const [open, ...closed] = panels(container);
    expect(open?.hasAttribute("inert")).toBe(false);
    for (const panel of closed) {
      expect(panel.hasAttribute("inert")).toBe(true);
      expect(panel.dataset.active).toBe("false");
    }
    expect(rule('.vk-formats-panes > [role="tabpanel"]')).toContain("grid-area: 1 / 1;");
    expect(rule('.vk-formats-panes > [data-active="false"]')).toContain("visibility: hidden;");
    expect(FLAT_CSS).not.toMatch(
      /\.vk-formats-panes > \[data-active="false"\] \{[^}]*display: none/,
    );
  });

  it("caps a long output and scrolls it inside the pane", () => {
    expect(rule(".vk-formats-code")).toContain(
      "max-height: calc(var(--format-pane-rows) * var(--format-line) + 1.5rem);",
    );
    expect(rule(".vk-formats-code")).toContain("overflow-y: auto;");
    expect(GLOBAL_CSS).toContain("--format-pane-rows: 16;");
  });

  it("lets the keyboard reach and scroll the open pane, named by its file", async () => {
    const container = await render();
    for (const [index, id] of SUPPORTED_FORMAT_IDS.entries()) {
      const code = panels(container)[index]?.querySelector<HTMLElement>(".vk-formats-code");
      const caption = panels(container)[index]?.querySelector("figcaption");
      expect(code?.tagName).toBe("SECTION");
      expect(code?.tabIndex).toBe(0);
      expect(code?.querySelector("pre")).not.toBeNull();
      expect(caption?.id).toBe(`formats-file-${id}`);
      expect(code?.getAttribute("aria-labelledby")).toBe(caption?.id);
    }
    expect(rule(".vk-formats-code:focus-visible")).toContain(
      "outline: 2px solid var(--focus-ring);",
    );
    const closed = panels(container).filter((panel) => panel.dataset.active === "false");
    expect(closed.every((panel) => panel.hasAttribute("inert"))).toBe(true);
  });

  it("switches the pane with a tab and counts select-tab from the formats section", async () => {
    const container = await render();
    const yaml = tabs(container)[SUPPORTED_FORMAT_IDS.indexOf("yaml")];
    act(() => yaml?.click());
    expect(activePanel(container)?.querySelector("figcaption")?.textContent).toBe(
      FORMAT_SAMPLES.yaml.file,
    );
    expect(trackUmamiEvent.mock.calls).toEqual([
      ["select-tab", { tab: "yaml", location: "formats" }],
    ]);
    act(() => yaml?.click());
    expect(trackUmamiEvent).toHaveBeenCalledTimes(1);
  });

  it("moves through the formats with the arrow keys, Home and End", async () => {
    const container = await render();
    const list = container.querySelector('[role="tablist"]');
    act(() => {
      list?.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    });
    expect(tabs(container).at(-1)?.getAttribute("aria-selected")).toBe("true");
    act(() => {
      list?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    expect(tabs(container)[0]?.getAttribute("aria-selected")).toBe("true");
  });

  it("offers one framework chip per marquee framework, and a chip selects its format", async () => {
    const container = await render();
    expect(chips(container).map((chip) => chip.textContent)).toEqual(
      STACK_FRAMEWORKS.map((framework) => framework.name),
    );
    for (const chip of chips(container)) expect(chip.getAttribute("aria-pressed")).toBe("false");
    const flutter = chips(container)[STACK_FRAMEWORKS.findIndex((item) => item.key === "flutter")];
    act(() => flutter?.click());
    expect(flutter?.getAttribute("aria-pressed")).toBe("true");
    expect(
      tabs(container)[SUPPORTED_FORMAT_IDS.indexOf("arb")]?.getAttribute("aria-selected"),
    ).toBe("true");
    expect(trackUmamiEvent.mock.calls).toEqual([
      ["select-tab", { tab: "arb", location: "formats", framework: "flutter" }],
    ]);
    act(() => tabs(container)[0]?.click());
    expect(flutter?.getAttribute("aria-pressed")).toBe("false");
  });

  it("draws each framework icon once, from a sprite, and keeps the icon set out of the client island", async () => {
    const container = await render();
    expect(container.querySelectorAll("symbol").length).toBe(
      new Set(STACK_FRAMEWORKS.map((item) => item.icon)).size,
    );
    expect(container.querySelectorAll(".vk-formats-chip use")).toHaveLength(
      STACK_FRAMEWORKS.length,
    );
    expect(SWITCH_SOURCE.startsWith('"use client"')).toBe(true);
    expect(SWITCH_SOURCE).not.toContain("stack-icons");
    expect(SWITCH_SOURCE).not.toContain("useTranslations");
  });

  it("gives every chip and tab a 44px target", () => {
    expect(rule(".vk-formats-chip")).toContain("min-height: 2.75rem;");
    expect(rule('.vk-formats-tablist [role="tab"]')).toContain("min-height: 2.75rem;");
  });

  it("links the formats page in the page's locale, counted as click-cta", async () => {
    const container = await render();
    const link = container.querySelector<HTMLAnchorElement>(".vk-formats-more a");
    expect(link?.getAttribute("href")).toBe("/de/docs/formats");
    expect(link?.hasAttribute("data-umami-event")).toBe(false);
    act(() => link?.click());
    expect(trackUmamiEvent).toHaveBeenCalledWith("click-cta", {
      location: "formats",
      target: "formats-docs",
    });
  });
});
