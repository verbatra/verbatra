// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { FlowTabs } from "./flow-tabs";

const TABS = [
  { id: "file", label: ".mcp.json" },
  { id: "command", label: "claude mcp add" },
] as const;

function tabs() {
  return <FlowTabs idPrefix="t" labelledBy="title" tabs={TABS} panels={["json", "bash"]} />;
}

let mounted: { root: Root; host: HTMLElement } | undefined;

afterEach(() => {
  if (mounted === undefined) return;
  const { root, host } = mounted;
  mounted = undefined;
  act(() => root.unmount());
  host.remove();
});

function mount(): HTMLElement {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(tabs()));
  mounted = { root, host };
  return host;
}

describe("FlowTabs", () => {
  it("serves both panels without inert, so both stay readable before hydration", () => {
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(tabs());
    const panels = [...host.querySelectorAll('[role="tabpanel"]')];
    expect(panels.map((panel) => panel.hasAttribute("inert"))).toEqual([false, false]);
    expect(panels.map((panel) => panel.getAttribute("data-active"))).toEqual(["true", "false"]);
  });

  it("names the tab list by the heading it is given", () => {
    const host = mount();
    expect(host.querySelector('[role="tablist"]')?.getAttribute("aria-labelledby")).toBe("title");
  });

  it("shows one panel at a time once hydrated and switches on a tab click", () => {
    const host = mount();
    const panels = () => [...host.querySelectorAll('[role="tabpanel"]')];
    expect(panels().map((panel) => panel.hasAttribute("inert"))).toEqual([false, true]);
    const second = host.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1];
    act(() => second?.click());
    expect(panels().map((panel) => panel.hasAttribute("inert"))).toEqual([true, false]);
    expect(second?.getAttribute("aria-selected")).toBe("true");
  });
});
