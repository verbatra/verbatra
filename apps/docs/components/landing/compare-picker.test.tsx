// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { ComparePicker, PICKER_LIVE_ATTRIBUTE } from "./compare-picker";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const OPTIONS = [
  { id: "lingo", name: "Lingo.dev" },
  { id: "tolgee", name: "Tolgee" },
  { id: "weblate", name: "Weblate" },
];

afterEach(() => {
  document.body.innerHTML = "";
  window.history.replaceState(null, "", "/");
});

function mount(): { select: HTMLSelectElement; pair: (id: string) => HTMLDetailsElement } {
  document.body.innerHTML = `<div class="vk-compare"><div id="host"></div><div data-compare-pairs>${OPTIONS.map(
    ({ id }, index) =>
      `<details data-pair="${id}"${index === 0 ? " data-selected open" : ""}><summary>${id}</summary></details>`,
  ).join("")}</div></div>`;
  const root = createRoot(document.getElementById("host") as HTMLElement);
  act(() => root.render(<ComparePicker label="Compare Verbatra with" options={OPTIONS} />));
  return {
    select: document.querySelector("select") as HTMLSelectElement,
    pair: (id) => document.querySelector(`[data-pair="${id}"]`) as HTMLDetailsElement,
  };
}

function choose(select: HTMLSelectElement, value: string): void {
  act(() => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("ComparePicker", () => {
  it("marks the comparison as having a live picker while it is mounted and unmarks it after", () => {
    document.body.innerHTML = '<div class="vk-compare"><div id="host"></div></div>';
    const compare = document.querySelector(".vk-compare") as HTMLElement;
    expect(compare.hasAttribute(PICKER_LIVE_ATTRIBUTE)).toBe(false);
    const root = createRoot(document.getElementById("host") as HTMLElement);
    act(() => root.render(<ComparePicker label="Compare" options={OPTIONS} />));
    expect(compare.hasAttribute(PICKER_LIVE_ATTRIBUTE)).toBe(true);
    act(() => root.unmount());
    expect(compare.hasAttribute(PICKER_LIVE_ATTRIBUTE)).toBe(false);
  });

  it("names a native select by its label and starts on the first tool", () => {
    const { select } = mount();
    expect(document.querySelector("label")?.textContent).toBe("Compare Verbatra with");
    expect(document.querySelector("label")?.getAttribute("for")).toBe(select.id);
    expect(Array.from(select.options, (option) => option.value)).toEqual([
      "lingo",
      "tolgee",
      "weblate",
    ]);
    expect(select.value).toBe("lingo");
  });

  it("shows the chosen pair and keeps the choice in the URL without a history entry", () => {
    const { select, pair } = mount();
    const length = window.history.length;
    choose(select, "weblate");
    expect(pair("weblate").hasAttribute("data-selected")).toBe(true);
    expect(pair("weblate").open).toBe(true);
    expect(pair("lingo").hasAttribute("data-selected")).toBe(false);
    expect(window.location.search).toBe("?tool=weblate");
    expect(window.history.length).toBe(length);
  });

  it("starts on the tool a shared URL names", () => {
    window.history.replaceState(null, "", "/?tool=tolgee&x=1");
    const { select, pair } = mount();
    expect(select.value).toBe("tolgee");
    expect(pair("tolgee").hasAttribute("data-selected")).toBe(true);
    expect(pair("lingo").hasAttribute("data-selected")).toBe(false);
  });

  it("ignores a tool it does not list and keeps other query parameters", () => {
    window.history.replaceState(null, "", "/?tool=nope&x=1");
    const { select, pair } = mount();
    expect(select.value).toBe("lingo");
    expect(pair("lingo").hasAttribute("data-selected")).toBe(true);
    choose(select, "tolgee");
    expect(window.location.search).toBe("?tool=tolgee&x=1");
  });
});
