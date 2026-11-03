import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Mounted {
  readonly container: HTMLDivElement;
  readonly root: Root;
}

const mounted: Mounted[] = [];

export interface RenderResult {
  readonly container: HTMLDivElement;
  get<T extends Element = HTMLElement>(selector: string): T;
  query(selector: string): Element | null;
  all(selector: string): HTMLElement[];
  text(): string;
}

export function render(node: ReactNode): RenderResult {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ container, root });
  act(() => {
    root.render(node);
  });
  return {
    container,
    get<T extends Element = HTMLElement>(selector: string): T {
      const element = container.querySelector<T>(selector);
      if (element === null) {
        throw new Error(`no element matched ${selector}`);
      }
      return element;
    },
    query: (selector) => container.querySelector(selector),
    all: (selector) => [...container.querySelectorAll<HTMLElement>(selector)],
    text: () => container.textContent ?? "",
  };
}

export function click(element: Element): void {
  act(() => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

afterEach(() => {
  for (const { container, root } of mounted.splice(0)) {
    act(() => {
      root.unmount();
    });
    container.remove();
  }
});
