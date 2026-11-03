// @vitest-environment jsdom

import { Icon } from "@verbatra/ui";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { Dropdown, type DropdownItem } from "./Dropdown.js";
import { click, pressKey, render } from "./test-support.js";

const TRIGGER = "button[aria-haspopup='true']";
const ITEM = "button:not([aria-haspopup])";

function actionItems(onSelect = vi.fn()): readonly DropdownItem[] {
  return [
    { id: "export", label: "Export", onSelect },
    { id: "import", label: "Import", onSelect },
  ];
}

describe("Dropdown", () => {
  it("renders only the trigger while closed, reported by aria-expanded", () => {
    const view = render(<Dropdown label="Actions" items={actionItems()} />);

    expect(view.get(TRIGGER).getAttribute("aria-expanded")).toBe("false");
    expect(view.all(ITEM)).toHaveLength(0);
  });

  it("renders the trigger label next to a decorative chevron", () => {
    const view = render(<Dropdown label="Actions" items={actionItems()} />);

    expect(view.get(TRIGGER).textContent).toBe("Actions");
    expect(view.get("svg").getAttribute("aria-hidden")).toBe("true");
  });

  it("opens the list when the trigger is pressed", () => {
    const view = render(<Dropdown label="Actions" items={actionItems()} />);

    click(view.get(TRIGGER));

    expect(view.get(TRIGGER).getAttribute("aria-expanded")).toBe("true");
    expect(view.all(ITEM).map((item) => item.textContent)).toEqual(["Export", "Import"]);
  });

  it("closes again when the trigger is pressed a second time", () => {
    const view = render(<Dropdown label="Actions" items={actionItems()} />);

    click(view.get(TRIGGER));
    click(view.get(TRIGGER));

    expect(view.all(ITEM)).toHaveLength(0);
  });

  it("closes on Escape, leaving nothing selected", () => {
    const onSelect = vi.fn();
    const view = render(<Dropdown label="Actions" items={actionItems(onSelect)} />);

    click(view.get(TRIGGER));
    pressKey("Escape");

    expect(view.all(ITEM)).toHaveLength(0);
    expect(view.get(TRIGGER).getAttribute("aria-expanded")).toBe("false");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("closes when a pointer press lands outside the trigger and the list", () => {
    const view = render(<Dropdown label="Actions" items={actionItems()} />);

    click(view.get(TRIGGER));
    act(() => {
      document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });

    expect(view.all(ITEM)).toHaveLength(0);
  });

  it("calls the chosen item's handler and closes the list", () => {
    const onSelect = vi.fn();
    const view = render(
      <Dropdown label="Actions" items={[{ id: "export", label: "Export", onSelect }]} />,
    );

    click(view.get(TRIGGER));
    click(view.getByText(ITEM, "Export"));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(view.all(ITEM)).toHaveLength(0);
  });

  it("does not run a disabled item's handler", () => {
    const onSelect = vi.fn();
    const view = render(
      <Dropdown
        label="Actions"
        items={[{ id: "export", label: "Export", onSelect, disabled: true }]}
      />,
    );

    click(view.get(TRIGGER));
    const item = view.getByText(ITEM, "Export");
    click(item);

    expect(item.hasAttribute("disabled")).toBe(true);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("names the floating panel after a plain-text trigger label", () => {
    const view = render(<Dropdown label="Actions" items={actionItems()} />);

    click(view.get(TRIGGER));

    expect(view.get("[role='dialog']").getAttribute("aria-label")).toBe("Actions");
  });

  it("prefers an explicit ariaLabel for both the trigger and the panel", () => {
    const view = render(
      <Dropdown label="Actions" ariaLabel="Project actions" items={actionItems()} />,
    );

    click(view.get(TRIGGER));

    expect(view.get(TRIGGER).getAttribute("aria-label")).toBe("Project actions");
    expect(view.get("[role='dialog']").getAttribute("aria-label")).toBe("Project actions");
  });

  it("leaves the panel role-less when an icon-only trigger carries no name to reuse", () => {
    const view = render(<Dropdown label={<Icon name="settings" />} items={actionItems()} />);

    click(view.get(TRIGGER));

    expect(view.query("[role='dialog']")).toBeNull();
  });

  it("marks the current choice with aria-current and a leading check in a pick-one list", () => {
    const view = render(
      <Dropdown
        label="Theme"
        items={[
          { id: "light", label: "Light", onSelect: vi.fn(), selected: true },
          { id: "dark", label: "Dark", onSelect: vi.fn(), selected: false },
        ]}
      />,
    );

    click(view.get(TRIGGER));
    const [light, dark] = view.all(ITEM);

    expect(light?.getAttribute("aria-current")).toBe("true");
    expect(dark?.hasAttribute("aria-current")).toBe(false);
    expect(light?.querySelector("svg")).not.toBeNull();
    expect(dark?.querySelector("svg")).toBeNull();
  });

  it("reserves the check gutter on every item of a pick-one list, so labels stay aligned", () => {
    const view = render(
      <Dropdown
        label="Theme"
        items={[
          { id: "light", label: "Light", onSelect: vi.fn(), selected: true },
          { id: "dark", label: "Dark", onSelect: vi.fn(), selected: false },
        ]}
      />,
    );

    click(view.get(TRIGGER));

    expect(view.all(ITEM).every((item) => item.querySelector("span") !== null)).toBe(true);
  });

  it("reserves no check gutter in an action list, where nothing is ever the current choice", () => {
    const view = render(<Dropdown label="Actions" items={actionItems()} />);

    click(view.get(TRIGGER));

    expect(view.all(ITEM).every((item) => item.querySelector("span") === null)).toBe(true);
  });

  it("uses the bordered secondary trigger by default", () => {
    const view = render(<Dropdown label="Actions" items={actionItems()} />);

    expect(view.get(TRIGGER).dataset.variant).toBe("secondary");
  });

  it("renders a low-emphasis trigger on request", () => {
    const view = render(<Dropdown label="Actions" items={actionItems()} variant="ghost" />);

    expect(view.get(TRIGGER).dataset.variant).toBe("ghost");
  });

  it("aligns the list to the inline start by default", () => {
    const view = render(<Dropdown label="Actions" items={actionItems()} />);

    click(view.get(TRIGGER));

    expect(view.get("[role='dialog']").classList.contains("start-0")).toBe(true);
  });

  it("aligns the list to the inline end on request, for a trigger at the page edge", () => {
    const view = render(<Dropdown label="Actions" items={actionItems()} align="end" />);

    click(view.get(TRIGGER));

    expect(view.get("[role='dialog']").classList.contains("end-0")).toBe(true);
  });

  it("keeps two items that share a label independent, without a duplicate-key warning", () => {
    const warnings: string[] = [];
    const consoleError = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      warnings.push(args.map(String).join(" "));
    });
    const onBritish = vi.fn();
    const onAmerican = vi.fn();

    try {
      const view = render(
        <Dropdown
          label="Locale"
          items={[
            { id: "en-GB", label: "English", onSelect: onBritish },
            { id: "en-US", label: "English", onSelect: onAmerican },
          ]}
        />,
      );

      click(view.get(TRIGGER));
      expect(view.all(ITEM).map((item) => item.textContent)).toEqual(["English", "English"]);

      const first = view.all(ITEM)[0];
      expect(first).toBeDefined();
      click(first as HTMLElement);
      expect(onBritish).toHaveBeenCalledTimes(1);
      expect(onAmerican).not.toHaveBeenCalled();

      click(view.get(TRIGGER));
      const second = view.all(ITEM)[1];
      expect(second).toBeDefined();
      click(second as HTMLElement);
      expect(onAmerican).toHaveBeenCalledTimes(1);
      expect(onBritish).toHaveBeenCalledTimes(1);

      expect(warnings.filter((message) => message.includes("same key"))).toEqual([]);
    } finally {
      consoleError.mockRestore();
    }
  });

  it("renders an empty list without an item, rather than failing", () => {
    const view = render(<Dropdown label="Actions" items={[]} />);

    click(view.get(TRIGGER));

    expect(view.all(ITEM)).toHaveLength(0);
    expect(view.get(TRIGGER).getAttribute("aria-expanded")).toBe("true");
  });
});
