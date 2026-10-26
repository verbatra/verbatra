// @vitest-environment jsdom

import { act, createElement, type ReactNode, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { inertOutside, useDrawerContainment } from "./use-drawer-containment";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Harness(): ReactNode {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useDrawerContainment({ open, mode: "drawer" }, triggerRef);
  return (
    <>
      <header data-header>
        <button type="button" data-search>
          Search
        </button>
        <button
          ref={triggerRef}
          type="button"
          data-trigger
          onClick={() => setOpen((value) => !value)}
        >
          Menu
        </button>
      </header>
      <main data-main id="nd-page" tabIndex={-1}>
        <a href="/page" data-page-link>
          Page
        </a>
      </main>
      {createElement("next-route-announcer", { "data-announcer": "" })}
      <div data-live aria-live="polite" />
      {open ? <div data-overlay /> : null}
      {open ? (
        <aside id="nd-sidebar-mobile">
          <a href="/one" data-first>
            One
          </a>
          <a href="/two" data-last>
            Two
          </a>
        </aside>
      ) : null}
    </>
  );
}

function Orphan(): ReactNode {
  const triggerRef = useRef<HTMLButtonElement>(null);
  useDrawerContainment({ open: true, mode: "drawer" }, triggerRef);
  return <button ref={triggerRef} type="button" />;
}

let mounted: { container: HTMLDivElement; root: Root } | undefined;

function render(): HTMLDivElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<Harness />));
  mounted = { container, root };
  return container;
}

function press(key: string, shiftKey = false): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true });
  act(() => {
    window.dispatchEvent(event);
  });
  return event;
}

afterEach(() => {
  act(() => mounted?.root.unmount());
  mounted?.container.remove();
  mounted = undefined;
});

describe("useDrawerContainment", () => {
  it("makes the page and the other header controls inert while the drawer is open, and moves focus in", () => {
    const container = render();
    const trigger = container.querySelector<HTMLElement>("[data-trigger]");
    act(() => trigger?.click());
    expect(container.querySelector("[data-main]")?.hasAttribute("inert")).toBe(true);
    expect(container.querySelector("[data-search]")?.hasAttribute("inert")).toBe(true);
    expect(trigger?.hasAttribute("inert")).toBe(false);
    expect(container.querySelector("[data-overlay]")?.hasAttribute("inert")).toBe(false);
    expect(container.querySelector("[data-first]")?.closest("[inert]")).toBeNull();
    expect(container.querySelector("aside")?.querySelectorAll("[inert]")).toHaveLength(0);
    expect(document.activeElement).toBe(container.querySelector("[data-first]"));
  });

  it("wraps Tab and Shift+Tab between the trigger and the drawer", () => {
    const container = render();
    act(() => container.querySelector<HTMLElement>("[data-trigger]")?.click());
    container.querySelector<HTMLElement>("[data-last]")?.focus();
    expect(press("Tab").defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(container.querySelector("[data-trigger]"));
    expect(press("Tab", true).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(container.querySelector("[data-last]"));
  });

  it("leaves Tab alone between two focusable items inside the drawer", () => {
    const container = render();
    act(() => container.querySelector<HTMLElement>("[data-trigger]")?.click());
    container.querySelector<HTMLElement>("[data-first]")?.focus();
    expect(press("Tab").defaultPrevented).toBe(false);
    expect(press("a").defaultPrevented).toBe(false);
  });

  it("restores the page and returns focus to the trigger when it closes", () => {
    const container = render();
    const trigger = container.querySelector<HTMLElement>("[data-trigger]");
    act(() => trigger?.click());
    act(() => trigger?.click());
    expect(container.querySelector("[data-main]")?.hasAttribute("inert")).toBe(false);
    expect(container.querySelector("[data-search]")?.hasAttribute("inert")).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it("leaves the route announcer and live regions reachable by assistive technology", () => {
    const container = render();
    act(() => container.querySelector<HTMLElement>("[data-trigger]")?.click());
    expect(container.querySelector("[data-announcer]")?.hasAttribute("inert")).toBe(false);
    expect(container.querySelector("[data-live]")?.hasAttribute("inert")).toBe(false);
    expect(document.documentElement.hasAttribute("inert")).toBe(false);
    expect(document.head.hasAttribute("inert")).toBe(false);
  });

  it("moves focus to the page, not the trigger, when the drawer closes after a navigation", () => {
    const container = render();
    const trigger = container.querySelector<HTMLElement>("[data-trigger]");
    act(() => trigger?.click());
    window.history.pushState({}, "", "/docs/elsewhere");
    act(() => trigger?.click());
    expect(document.activeElement).toBe(container.querySelector("#nd-page"));
    expect(container.querySelectorAll("[inert]")).toHaveLength(0);
    window.history.pushState({}, "", "/");
  });

  it("stops looking for a drawer that never mounts", () => {
    const frames: FrameRequestCallback[] = [];
    const original = window.requestAnimationFrame;
    window.requestAnimationFrame = (callback) => frames.push(callback);
    try {
      const container = document.createElement("div");
      document.body.appendChild(container);
      const root = createRoot(container);
      act(() => root.render(<Orphan />));
      let guard = 0;
      while (frames.length > 0 && guard < 200) {
        frames.shift()?.(0);
        guard += 1;
      }
      expect(guard).toBeLessThan(200);
      act(() => root.unmount());
      container.remove();
    } finally {
      window.requestAnimationFrame = original;
    }
  });

  it("does nothing while closed", () => {
    const container = render();
    expect(container.querySelector("[data-main]")?.hasAttribute("inert")).toBe(false);
  });
});

describe("inertOutside", () => {
  it("keeps already inert elements as they were when it restores", () => {
    const root = document.createElement("div");
    root.innerHTML = '<p id="keep"></p><p id="was" inert></p><p id="other"></p>';
    document.body.append(root);
    const restore = inertOutside([root.querySelector("#keep") as Element]);
    expect(root.querySelector("#other")?.hasAttribute("inert")).toBe(true);
    restore();
    expect(root.querySelector("#other")?.hasAttribute("inert")).toBe(false);
    expect(root.querySelector("#was")?.hasAttribute("inert")).toBe(true);
    root.remove();
  });
});
