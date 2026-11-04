// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { KeyStatus } from "../client/key-status-filter.js";
import { KeyFilters, type KeyFiltersProps } from "./KeyFilters.js";
import { click, render, selectOption, typeInto } from "./test-support.js";

const COUNTS: Readonly<Record<KeyStatus, number>> = {
  missing: 3,
  changed: 2,
  orphaned: 0,
  protected: 1,
  review: 4,
  integrity: 5,
};

function props(overrides: Partial<KeyFiltersProps> = {}): KeyFiltersProps {
  return {
    locales: ["de", "fr"],
    locale: "",
    statuses: new Set(),
    counts: COUNTS,
    unavailable: new Map(),
    query: "",
    onLocaleChange: vi.fn(),
    onToggleStatus: vi.fn(),
    onQueryChange: vi.fn(),
    ...overrides,
  };
}

function chip(view: ReturnType<typeof render>, status: KeyStatus): HTMLButtonElement {
  return view.get(`[data-status-filter="${status}"]`) as HTMLButtonElement;
}

describe("KeyFilters", () => {
  it("groups the controls under one name and offers one chip per status with its label and count", () => {
    const view = render(<KeyFilters {...props()} />);

    expect(view.get("legend").textContent).toBe("Key filters");
    expect(view.all("[data-status-filter]").map((element) => element.textContent)).toEqual([
      "Missing3",
      "Changed2",
      "Orphaned0",
      "Protected1",
      "Review queue4",
      "Integrity problems5",
    ]);
    expect(view.all("[aria-pressed='true']")).toEqual([]);
  });

  it("marks the chosen statuses as pressed", () => {
    const view = render(<KeyFilters {...props({ statuses: new Set<KeyStatus>(["review"]) })} />);

    expect(chip(view, "review").getAttribute("aria-pressed")).toBe("true");
    expect(chip(view, "missing").getAttribute("aria-pressed")).toBe("false");
  });

  it("reports each change through its callback", () => {
    const handlers = {
      onLocaleChange: vi.fn(),
      onToggleStatus: vi.fn(),
      onQueryChange: vi.fn(),
    };
    const view = render(<KeyFilters {...props(handlers)} />);

    typeInto(view.get('input[type="search"]') as HTMLInputElement, "cart");
    selectOption(view.get("select") as HTMLSelectElement, "fr");
    click(chip(view, "changed"));

    expect(handlers.onQueryChange).toHaveBeenCalledWith("cart");
    expect(handlers.onLocaleChange).toHaveBeenCalledWith("fr");
    expect(handlers.onToggleStatus).toHaveBeenCalledWith("changed");
  });

  it("keeps an unavailable status focusable, hides its count and explains why", () => {
    const onToggleStatus = vi.fn();
    const view = render(
      <KeyFilters
        {...props({
          onToggleStatus,
          unavailable: new Map([["review", "Not available right now"]]),
        })}
      />,
    );

    expect(chip(view, "review").textContent).toBe("Review queue…");
    expect(chip(view, "review").getAttribute("aria-disabled")).toBe("true");
    expect(view.get("[role='tooltip']").textContent).toBe("Not available right now");

    click(chip(view, "review"));
    expect(onToggleStatus).not.toHaveBeenCalled();
  });
});
