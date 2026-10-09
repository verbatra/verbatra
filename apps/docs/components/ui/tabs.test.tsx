// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import Tabs, { TabList, tabId, tabPanelId } from "./tabs";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TABS = [
  { id: "npm", label: "npm" },
  { id: "pnpm", label: "pnpm" },
  { id: "yarn", label: "yarn" },
];

let mounted: { container: HTMLDivElement; root: Root } | undefined;

function render(node: ReactNode): HTMLDivElement {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(node);
  });
  mounted = { container, root };
  return container;
}

function tabs(container: HTMLElement): HTMLButtonElement[] {
  return [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
}

function press(container: HTMLElement, key: string): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  act(() => {
    container.querySelector('[role="tablist"]')?.dispatchEvent(event);
  });
  return event;
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

describe("TabList", () => {
  it("gives only the active tab a tab stop", () => {
    const container = render(<TabList tabs={TABS} active="pnpm" onSelect={() => {}} />);

    expect(tabs(container).map((tab) => tab.tabIndex)).toEqual([-1, 0, -1]);
    expect(tabs(container).map((tab) => tab.getAttribute("aria-selected"))).toEqual([
      "false",
      "true",
      "false",
    ]);
  });

  it("wires each tab to its panel when an id prefix is given", () => {
    const container = render(
      <TabList tabs={TABS} active="npm" onSelect={() => {}} idPrefix="install" />,
    );

    expect(tabs(container).map((tab) => [tab.id, tab.getAttribute("aria-controls")])).toEqual(
      TABS.map(({ id }) => [tabId("install", id), tabPanelId("install", id)]),
    );
  });

  it("sets no ids or aria-controls without an id prefix", () => {
    const container = render(<TabList tabs={TABS} active="npm" onSelect={() => {}} />);

    for (const tab of tabs(container)) {
      expect(tab.hasAttribute("id")).toBe(false);
      expect(tab.hasAttribute("aria-controls")).toBe(false);
    }
  });

  it("moves selection and focus with the arrow keys, wrapping at both ends", () => {
    const onSelect = vi.fn();
    const first = render(<TabList tabs={TABS} active="npm" onSelect={onSelect} />);

    const left = press(first, "ArrowLeft");
    expect(onSelect).toHaveBeenLastCalledWith("yarn");
    expect(document.activeElement).toBe(tabs(first)[2]);
    expect(left.defaultPrevented).toBe(true);

    act(() => {
      mounted?.root.render(<TabList tabs={TABS} active="yarn" onSelect={onSelect} />);
    });
    press(first, "ArrowRight");
    expect(onSelect).toHaveBeenLastCalledWith("npm");
    expect(document.activeElement).toBe(tabs(first)[0]);
  });

  it("jumps to the first tab with Home and the last with End", () => {
    const onSelect = vi.fn();
    const container = render(<TabList tabs={TABS} active="pnpm" onSelect={onSelect} />);

    const end = press(container, "End");
    expect(onSelect).toHaveBeenLastCalledWith("yarn");
    expect(document.activeElement).toBe(tabs(container)[2]);
    expect(end.defaultPrevented).toBe(true);

    const home = press(container, "Home");
    expect(onSelect).toHaveBeenLastCalledWith("npm");
    expect(document.activeElement).toBe(tabs(container)[0]);
    expect(home.defaultPrevented).toBe(true);
  });

  it("ignores other keys", () => {
    const onSelect = vi.fn();
    const container = render(<TabList tabs={TABS} active="npm" onSelect={onSelect} />);

    const event = press(container, "Enter");

    expect(onSelect).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("selects a tab on click", () => {
    const onSelect = vi.fn();
    const container = render(<TabList tabs={TABS} active="npm" onSelect={onSelect} />);

    act(() => {
      tabs(container)[1]?.click();
    });

    expect(onSelect).toHaveBeenCalledWith("pnpm");
  });
});

describe("Tabs", () => {
  it("tracks its own selection when uncontrolled", () => {
    const onChange = vi.fn();
    const container = render(<Tabs tabs={TABS} onChange={onChange} />);

    press(container, "ArrowRight");

    expect(onChange).toHaveBeenCalledWith("pnpm");
    expect(tabs(container).map((tab) => tab.tabIndex)).toEqual([-1, 0, -1]);
  });

  it("follows the value prop when controlled", () => {
    const onChange = vi.fn();
    const container = render(<Tabs tabs={TABS} value="yarn" onChange={onChange} />);

    press(container, "ArrowRight");

    expect(onChange).toHaveBeenCalledWith("npm");
    expect(tabs(container).map((tab) => tab.tabIndex)).toEqual([-1, -1, 0]);
  });
});
