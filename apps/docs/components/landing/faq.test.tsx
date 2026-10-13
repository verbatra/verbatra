// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";
import { preloadRegisteredIslands } from "@/test-support/islands";

vi.mock("next-intl/server", () => ({
  getTranslations: async () =>
    Object.assign((key: string) => key, { rich: (key: string) => `answer:${key}` }),
  getLocale: async () => "en",
}));

const { Faq } = await import("./faq");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ITEMS = [
  { id: "formats", question: "Which formats?" },
  { id: "incremental", question: "Why incremental?" },
  { id: "providers", question: "Which providers?" },
];

await preloadRegisteredIslands();

let mounted: { container: HTMLDivElement; root: Root } | undefined;

async function render(): Promise<HTMLDivElement> {
  const element = await Faq({ items: ITEMS });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  mounted = { container, root };
  return container;
}

afterEach(() => {
  if (!mounted) return;
  const { container, root } = mounted;
  mounted = undefined;
  act(() => {
    root.unmount();
  });
  container.remove();
});

function triggers(container: HTMLElement): ReadonlyArray<HTMLButtonElement> {
  return [...container.querySelectorAll<HTMLButtonElement>("button[aria-expanded]")];
}

function expanded(container: HTMLElement): ReadonlyArray<string | null> {
  return triggers(container).map((button) => button.getAttribute("aria-expanded"));
}

function press(target: HTMLElement, key: string): void {
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
}

describe("the landing faq", () => {
  it("renders one trigger per item, each a button inside an h3", async () => {
    const buttons = triggers(await render());
    expect(buttons).toHaveLength(ITEMS.length);
    for (const button of buttons) expect(button.parentElement?.tagName).toBe("H3");
    expect(buttons.map((button) => button.textContent)).toEqual(ITEMS.map((item) => item.question));
  });

  it("starts with every item collapsed", async () => {
    expect(expanded(await render())).toEqual(ITEMS.map(() => "false"));
  });

  it("opens only the item that was clicked, names its region by the trigger, and closes it again", async () => {
    const container = await render();
    const [first, second] = triggers(container);
    act(() => first?.click());
    expect(expanded(container)).toEqual(["true", "false", "false"]);
    const region = container.querySelector(`#${first?.getAttribute("aria-controls")}`);
    expect(region?.getAttribute("role")).toBe("region");
    expect(region?.getAttribute("aria-labelledby")).toBe(first?.id);
    act(() => second?.click());
    expect(expanded(container)).toEqual(["false", "true", "false"]);
    act(() => second?.click());
    expect(expanded(container)).toEqual(["false", "false", "false"]);
  });

  it("moves focus between the questions with the arrow keys, Home and End", async () => {
    const container = await render();
    const buttons = triggers(container);
    buttons[0]?.focus();
    press(buttons[0] as HTMLButtonElement, "ArrowDown");
    expect(document.activeElement).toBe(buttons[1]);
    press(buttons[1] as HTMLButtonElement, "End");
    expect(document.activeElement).toBe(buttons[2]);
    press(buttons[2] as HTMLButtonElement, "Home");
    expect(document.activeElement).toBe(buttons[0]);
  });

  it("server-renders every answer, so the page carries the text before any script runs", async () => {
    const markup = renderToStaticMarkup(await Faq({ items: ITEMS }));
    for (const item of ITEMS) expect(markup).toContain(`answer:items.${item.id}.answer`);
  });

  it("hides a closed answer from layout and assistive technology through its item's state", async () => {
    const container = await render();
    const item = container.querySelector('[data-faq="formats"]');
    expect(item?.getAttribute("data-state")).toBe("closed");
    expect(item?.className).toContain(
      "[&[data-state=closed]>[data-slot=accordion-content]]:hidden",
    );
  });
});

describe("the landing faq copy", () => {
  it("answers the landing's audience in a focused set of questions", async () => {
    expect(Object.keys(en.landing.faq.items)).toEqual([
      "incremental",
      "providers",
      "formats",
      "ci",
      "keys",
      "privacy",
      "cost",
      "studio",
    ]);
  });

  it("stays a server section whose only client island is the accordion, fed questions only", async () => {
    const { readFileSync } = await import("node:fs");
    const read = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");
    expect(read("./faq.tsx")).not.toMatch(/^"use client"/);
    expect(read("./faq-accordion.tsx")).toMatch(/^"use client"/);
    expect(read("./faq-accordion.tsx")).not.toMatch(/answer/);
  });
});
