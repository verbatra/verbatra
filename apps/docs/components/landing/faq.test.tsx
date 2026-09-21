// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => Object.assign((key: string) => key, { rich: (key: string) => key }),
  useLocale: () => "en",
}));

const { Faq } = await import("./faq");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ITEMS = [
  { id: "formats", question: "Which formats?", answer: "Many." },
  { id: "incremental", question: "Why incremental?", answer: "A lock file." },
  { id: "providers", question: "Which providers?", answer: "Six." },
  { id: "safety", question: "What about bad output?", answer: "It is withheld." },
  { id: "cost", question: "What does it cost?", answer: "Nothing." },
];

let mounted: { container: HTMLDivElement; root: Root } | undefined;

function render(): HTMLDivElement {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
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
  if (!mounted) return;
  const { container, root } = mounted;
  mounted = undefined;
  act(() => {
    root.unmount();
  });
  container.remove();
});

function triggers(container: HTMLDivElement): ReadonlyArray<HTMLButtonElement> {
  return [...container.querySelectorAll<HTMLButtonElement>("button[aria-expanded]")];
}

describe("the landing faq", () => {
  it("renders one trigger per item", () => {
    expect(triggers(render())).toHaveLength(ITEMS.length);
  });

  it("starts with every item collapsed", () => {
    const container = render();

    expect(triggers(container).map((button) => button.getAttribute("aria-expanded"))).toEqual(
      ITEMS.map(() => "false"),
    );
  });

  it("opens only the item that was clicked", () => {
    const container = render();
    const [first] = triggers(container);
    if (!first) throw new Error("no faq trigger rendered");

    act(() => {
      first.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(triggers(container).map((button) => button.getAttribute("aria-expanded"))).toEqual([
      "true",
      ...ITEMS.slice(1).map(() => "false"),
    ]);
  });
});
