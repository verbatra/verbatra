// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";

const track = vi.hoisted(() => vi.fn());
vi.mock("@/lib/umami", () => ({ trackUmamiEvent: track }));
vi.mock("next-intl", () => ({
  useTranslations: () =>
    Object.assign((key: string) => key, { rich: (key: string) => `answer:${key}` }),
  useLocale: () => "en",
}));

const { Faq } = await import("./faq");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ITEMS = [
  { id: "formats", question: "Which formats?", answer: "Many." },
  { id: "incremental", question: "Why incremental?", answer: "A lock file." },
  { id: "providers", question: "Which providers?", answer: "Six." },
];

let mounted: { container: HTMLDivElement; root: Root } | undefined;

function render(): HTMLDivElement {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(<Faq items={ITEMS} />);
  });
  mounted = { container, root };
  return container;
}

afterEach(() => {
  track.mockReset();
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
  it("renders one trigger per item, each a button inside an h3", () => {
    const buttons = triggers(render());
    expect(buttons).toHaveLength(ITEMS.length);
    for (const button of buttons) expect(button.parentElement?.tagName).toBe("H3");
    expect(buttons.map((button) => button.textContent)).toEqual(ITEMS.map((item) => item.question));
  });

  it("starts with every item collapsed", () => {
    expect(expanded(render())).toEqual(ITEMS.map(() => "false"));
  });

  it("opens only the item that was clicked, names its region by the trigger, and closes it again", () => {
    const container = render();
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

  it("moves focus between the questions with the arrow keys, Home and End", () => {
    const container = render();
    const buttons = triggers(container);
    buttons[0]?.focus();
    press(buttons[0] as HTMLButtonElement, "ArrowDown");
    expect(document.activeElement).toBe(buttons[1]);
    press(buttons[1] as HTMLButtonElement, "End");
    expect(document.activeElement).toBe(buttons[2]);
    press(buttons[2] as HTMLButtonElement, "Home");
    expect(document.activeElement).toBe(buttons[0]);
  });

  it("counts opening a question by its key, never its text, and nothing when it closes", () => {
    const container = render();
    const question = triggers(container)[1];
    act(() => question?.click());
    act(() => question?.click());
    expect(track.mock.calls).toEqual([["open-faq", { question: "incremental", location: "faq" }]]);
  });

  it("server-renders every answer, so the page carries the text before any script runs", () => {
    const markup = renderToStaticMarkup(<Faq items={ITEMS} />);
    for (const item of ITEMS) expect(markup).toContain(`answer:items.${item.id}.answer`);
  });

  it("hides a closed answer from layout and assistive technology through its item's state", () => {
    const container = render();
    const item = container.querySelector('[data-faq="formats"]');
    expect(item?.getAttribute("data-state")).toBe("closed");
    expect(item?.className).toContain(
      "[&[data-state=closed]>[data-slot=accordion-content]]:hidden",
    );
  });
});

describe("the landing faq copy", () => {
  it("answers the landing's audience in a focused set of questions", () => {
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
});
