// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { revealActiveTab } from "./docs-tabs";

function box(left: number, right: number): DOMRect {
  return {
    left,
    right,
    top: 0,
    bottom: 0,
    width: right - left,
    height: 0,
    x: left,
    y: 0,
  } as DOMRect;
}

function tabList(activeLeft: number, activeRight: number, scrollLeft = 0): HTMLElement {
  const list = document.createElement("div");
  list.setAttribute("role", "tablist");
  list.getBoundingClientRect = () => box(0, 300);
  const tab = document.createElement("button");
  tab.setAttribute("role", "tab");
  tab.dataset.state = "active";
  tab.getBoundingClientRect = () => box(activeLeft, activeRight);
  list.append(tab);
  list.scrollLeft = scrollLeft;
  return list;
}

describe("revealActiveTab", () => {
  it("scrolls an active tab past the end edge into view, clear of the fade", () => {
    const list = tabList(320, 380);
    revealActiveTab(list);
    expect(list.scrollLeft).toBe(128);
  });

  it("scrolls an active tab before the start edge back into view", () => {
    const list = tabList(-100, -40, 200);
    revealActiveTab(list);
    expect(list.scrollLeft).toBe(84);
  });

  it("leaves a visible active tab where it is", () => {
    const list = tabList(40, 120, 10);
    revealActiveTab(list);
    expect(list.scrollLeft).toBe(10);
  });
});
