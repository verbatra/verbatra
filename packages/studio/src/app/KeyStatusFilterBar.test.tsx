// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { KeyStatus } from "../client/key-status-filter.js";
import { KeyStatusFilterBar, type KeyStatusFilterBarProps } from "./KeyStatusFilterBar.js";
import { click, render, selectOption, typeInto } from "./test-support.js";

const COUNTS: Readonly<Record<KeyStatus, number>> = {
  missing: 3,
  changed: 2,
  orphaned: 0,
  protected: 1,
  review: 4,
  integrity: 5,
};

function props(overrides: Partial<KeyStatusFilterBarProps> = {}): KeyStatusFilterBarProps {
  return {
    locales: ["de", "fr"],
    locale: "",
    statuses: new Set(),
    counts: COUNTS,
    unavailable: new Set(),
    query: "",
    onLocaleChange: vi.fn(),
    onToggleStatus: vi.fn(),
    onQueryChange: vi.fn(),
    ...overrides,
  };
}

function toggle(view: ReturnType<typeof render>, status: KeyStatus): HTMLButtonElement {
  return view.get(`[data-status-filter="${status}"]`) as HTMLButtonElement;
}

describe("KeyStatusFilterBar", () => {
  it("offers one toggle per status with its label and count, none pressed", () => {
    const view = render(<KeyStatusFilterBar {...props()} />);

    expect(view.all("[data-status-filter]").map((button) => button.textContent)).toEqual([
      "Missing3",
      "Changed2",
      "Orphaned0",
      "Protected1",
      "Review queue4",
      "Integrity problems5",
    ]);
    for (const button of view.all("[data-status-filter]")) {
      expect(button.getAttribute("aria-pressed")).toBe("false");
    }
  });

  it("marks a chosen status as pressed", () => {
    const view = render(<KeyStatusFilterBar {...props({ statuses: new Set(["review"]) })} />);

    expect(toggle(view, "review").getAttribute("aria-pressed")).toBe("true");
    expect(toggle(view, "missing").getAttribute("aria-pressed")).toBe("false");
  });

  it("reports each change through its callback", () => {
    const spies = props();
    const view = render(<KeyStatusFilterBar {...spies} />);

    click(toggle(view, "integrity"));
    selectOption(view.get('select[aria-label="Filter by locale"]') as HTMLSelectElement, "fr");
    typeInto(
      view.get('input[aria-label="Filter by key or translation text"]') as HTMLInputElement,
      "cart",
    );

    expect(spies.onToggleStatus).toHaveBeenCalledWith("integrity");
    expect(spies.onLocaleChange).toHaveBeenCalledWith("fr");
    expect(spies.onQueryChange).toHaveBeenCalledWith("cart");
  });

  it("disables a status whose data has not arrived, and shows no count for it", () => {
    const view = render(<KeyStatusFilterBar {...props({ unavailable: new Set(["review"]) })} />);

    expect(toggle(view, "review").disabled).toBe(true);
    expect(toggle(view, "review").textContent).toBe("Review queue…");
    expect(toggle(view, "review").title).toBe("Not available right now");
  });
});
