// @vitest-environment jsdom

import { act, type ReactNode, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { type DrawerState, useDrawerEscape } from "./use-drawer-escape";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Harness({
  initialOpen,
  mode = "drawer",
}: {
  initialOpen: boolean;
  mode?: DrawerState["mode"];
}): ReactNode {
  const [open, setOpen] = useState(initialOpen);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useDrawerEscape({ open, mode, setOpen }, triggerRef);
  return (
    <>
      <button ref={triggerRef} type="button" data-trigger aria-expanded={open}>
        Menu
      </button>
      {open ? (
        <aside data-drawer>
          <a href="/docs" data-link>
            Docs
          </a>
        </aside>
      ) : null}
      <div role="dialog" data-search>
        <input data-search-input />
      </div>
      <a href="/elsewhere" data-outside>
        Elsewhere
      </a>
    </>
  );
}

let mounted: { container: HTMLDivElement; root: Root } | undefined;

function render(node: ReactNode): HTMLDivElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(node));
  mounted = { container, root };
  return container;
}

function pressEscape(target: Element): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

function el(container: HTMLElement, selector: string): HTMLElement {
  const found = container.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`missing ${selector}`);
  return found;
}

afterEach(() => {
  if (!mounted) return;
  act(() => mounted?.root.unmount());
  mounted.container.remove();
  mounted = undefined;
});

describe("useDrawerEscape", () => {
  it("closes the open drawer on Escape and returns focus to the menu trigger", () => {
    const container = render(<Harness initialOpen />);
    const link = el(container, "[data-link]");
    link.focus();
    const event = pressEscape(link);
    expect(container.querySelector("[data-drawer]")).toBeNull();
    expect(el(container, "[data-trigger]").getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(el(container, "[data-trigger]"));
    expect(event.defaultPrevented).toBe(true);
  });

  it("does nothing on Escape while the drawer is closed", () => {
    const container = render(<Harness initialOpen={false} />);
    const outside = el(container, "[data-outside]");
    outside.focus();
    const event = pressEscape(outside);
    expect(document.activeElement).toBe(outside);
    expect(event.defaultPrevented).toBe(false);
  });

  it("leaves Escape to the search dialog while focus is inside it", () => {
    const container = render(<Harness initialOpen />);
    const input = el(container, "[data-search-input]");
    input.focus();
    const event = pressEscape(input);
    expect(container.querySelector("[data-drawer]")).not.toBeNull();
    expect(document.activeElement).toBe(input);
    expect(event.defaultPrevented).toBe(false);
  });

  it("ignores Escape that another handler already consumed", () => {
    const container = render(<Harness initialOpen />);
    const link = el(container, "[data-link]");
    link.addEventListener("keydown", (event) => event.preventDefault());
    pressEscape(link);
    expect(container.querySelector("[data-drawer]")).not.toBeNull();
  });

  it("ignores Escape in the desktop sidebar mode", () => {
    const container = render(<Harness initialOpen mode="full" />);
    pressEscape(el(container, "[data-link]"));
    expect(container.querySelector("[data-drawer]")).not.toBeNull();
  });

  it("ignores keys other than Escape", () => {
    const container = render(<Harness initialOpen />);
    act(() => {
      el(container, "[data-link]").dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    expect(container.querySelector("[data-drawer]")).not.toBeNull();
  });
});
