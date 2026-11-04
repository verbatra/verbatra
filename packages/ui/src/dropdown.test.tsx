// @vitest-environment jsdom
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { Dropdown, type DropdownItem } from "./dropdown.tsx";
import { click, pressKey, render } from "./test-support.tsx";

const TRIGGER = "button[aria-haspopup='menu']";
const MENU = "[role='menu']";

function items(overrides: Partial<DropdownItem>[] = [], onSelect = () => {}): DropdownItem[] {
  const base: DropdownItem[] = [
    { id: "a", label: "Alpha", onSelect },
    { id: "b", label: "Beta", onSelect },
    { id: "c", label: "Gamma", onSelect },
  ];
  return base.map((item, index) => ({ ...item, ...overrides[index] }));
}

function keyOn(element: Element, key: string): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  act(() => {
    element.dispatchEvent(event);
  });
  return event;
}

function open(list: DropdownItem[], props: { ariaLabel?: string; label?: string } = {}) {
  const view = render(<Dropdown label={props.label ?? "Actions"} items={list} {...props} />);
  click(view.get(TRIGGER));
  return view;
}

describe("Dropdown", () => {
  it("renders a closed menu button that announces a menu", () => {
    const view = render(<Dropdown label="Actions" items={items()} />);
    const trigger = view.get(TRIGGER);

    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(view.query(MENU)).toBeNull();
  });

  it("opens a named menu of items on click and focuses the first one", () => {
    const view = open(items());

    expect(view.get(TRIGGER).getAttribute("aria-expanded")).toBe("true");
    expect(view.get(MENU).getAttribute("aria-label")).toBe("Actions");
    expect(view.all("[role='menuitem']").map((item) => item.textContent)).toEqual([
      "Alpha",
      "Beta",
      "Gamma",
    ]);
    expect(document.activeElement).toBe(view.getByText("button", "Alpha"));
  });

  it("opens with ArrowDown from the trigger and ignores other keys there", () => {
    const view = render(<Dropdown label="Actions" items={items()} />);

    expect(keyOn(view.get(TRIGGER), "ArrowUp").defaultPrevented).toBe(false);
    expect(view.query(MENU)).toBeNull();

    expect(keyOn(view.get(TRIGGER), "ArrowDown").defaultPrevented).toBe(true);
    expect(view.query(MENU)).not.toBeNull();
    expect(document.activeElement).toBe(view.getByText("button", "Alpha"));
  });

  it("leaves ArrowDown to the menu once it is open", () => {
    const view = open(items());

    expect(keyOn(view.get(TRIGGER), "ArrowDown").defaultPrevented).toBe(false);
  });

  it("moves focus with the arrow keys, wrapping at both ends", () => {
    const view = open(items());
    const menu = view.get(MENU);

    keyOn(document.activeElement as Element, "ArrowDown");
    expect(document.activeElement).toBe(view.getByText("button", "Beta"));
    keyOn(document.activeElement as Element, "ArrowDown");
    keyOn(document.activeElement as Element, "ArrowDown");
    expect(document.activeElement).toBe(view.getByText("button", "Alpha"));
    keyOn(document.activeElement as Element, "ArrowUp");
    expect(document.activeElement).toBe(view.getByText("button", "Gamma"));
    expect(menu.isConnected).toBe(true);
  });

  it("jumps with Home and End and ignores other keys", () => {
    const view = open(items());

    keyOn(document.activeElement as Element, "End");
    expect(document.activeElement).toBe(view.getByText("button", "Gamma"));
    keyOn(document.activeElement as Element, "Home");
    expect(document.activeElement).toBe(view.getByText("button", "Alpha"));
    expect(keyOn(document.activeElement as Element, "x").defaultPrevented).toBe(false);
  });

  it("skips disabled items while moving", () => {
    const view = open(items([{}, { disabled: true }]));

    keyOn(document.activeElement as Element, "ArrowDown");

    expect(document.activeElement).toBe(view.getByText("button", "Gamma"));
  });

  it("selects an item, closes, and returns focus to the trigger", () => {
    const onSelect = vi.fn();
    const view = open(items([{}, { onSelect }]));

    click(view.getByText("button", "Beta"));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(view.query(MENU)).toBeNull();
    expect(document.activeElement).toBe(view.get(TRIGGER));
  });

  it("closes on Escape and returns focus to the trigger", () => {
    const view = open(items());

    pressKey("Escape");

    expect(view.query(MENU)).toBeNull();
    expect(document.activeElement).toBe(view.get(TRIGGER));
  });

  it("closes on Tab with focus back on the trigger, so Tab continues from there", () => {
    const view = open(items());

    keyOn(document.activeElement as Element, "Tab");

    expect(view.query(MENU)).toBeNull();
    expect(document.activeElement).toBe(view.get(TRIGGER));
  });

  it("marks the current choice as a checked radio item and focuses it on open", () => {
    const view = open(items([{}, { selected: true }]));
    const radios = view.all("[role='menuitemradio']");

    expect(radios.map((item) => item.getAttribute("aria-checked"))).toEqual([
      "false",
      "true",
      "false",
    ]);
    expect(document.activeElement).toBe(view.getByText("button", "Beta"));
    expect(view.getByText("button", "Beta").querySelector("svg")).not.toBeNull();
    expect(view.getByText("button", "Alpha").querySelector("svg")).toBeNull();
  });

  it("draws the check glyph in the accent color, not the fill color", () => {
    const view = open(items([{ selected: true }]));

    expect(view.get("[role='menuitemradio'] span").className).toContain("text-(--accent)");
  });

  it("names the trigger from ariaLabel and falls back to the text label for the menu", () => {
    const named = open(items(), { ariaLabel: "Theme: Dark" });
    const unnamed = render(<Dropdown label={<b>Icon</b>} items={items()} />);
    click(unnamed.get(TRIGGER));

    expect(named.get(TRIGGER).getAttribute("aria-label")).toBe("Theme: Dark");
    expect(named.get(MENU).getAttribute("aria-label")).toBe("Theme: Dark");
    expect(unnamed.get(MENU).hasAttribute("aria-label")).toBe(false);
  });

  it("toggles closed when the trigger is pressed again", () => {
    const view = open(items());

    click(view.get(TRIGGER));

    expect(view.query(MENU)).toBeNull();
  });

  it("opens an empty menu without failing on arrow keys", () => {
    const view = open([]);

    keyOn(view.get("[role='presentation']"), "ArrowDown");

    expect(view.get(MENU)).not.toBeNull();
  });
});
