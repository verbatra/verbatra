// @vitest-environment jsdom
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { FilterChip } from "./filter-chip.tsx";
import { click, render } from "./test-support.tsx";

describe("FilterChip", () => {
  it("shows its label and count and reports whether it is pressed", () => {
    const view = render(
      <FilterChip pressed={false} count={3}>
        Missing
      </FilterChip>,
    );
    const chip = view.get("button");

    expect(chip.textContent).toBe("Missing3");
    expect(chip.getAttribute("aria-pressed")).toBe("false");
    expect(chip.hasAttribute("aria-disabled")).toBe(false);
  });

  it("exposes its count as data-count, zero for an empty chip, without changing its pressed state", () => {
    const empty = render(
      <FilterChip pressed={false} count={0}>
        Orphaned
      </FilterChip>,
    );
    const full = render(
      <FilterChip pressed={false} count={4}>
        Missing
      </FilterChip>,
    );

    expect(empty.get("button").dataset.count).toBe("0");
    expect(empty.get("button").getAttribute("aria-pressed")).toBe("false");
    expect(full.get("button").dataset.count).toBe("4");
  });

  it("marks a pressed chip", () => {
    const view = render(
      <FilterChip pressed count={1}>
        Missing
      </FilterChip>,
    );

    expect(view.get("button").getAttribute("aria-pressed")).toBe("true");
  });

  it("reports a click and forwards native attributes", () => {
    const onClick = vi.fn();
    const view = render(
      <FilterChip pressed={false} count={0} onClick={onClick} data-status-filter="changed">
        Changed
      </FilterChip>,
    );

    click(view.get("button"));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(view.get("button").dataset.statusFilter).toBe("changed");
  });

  it("merges a caller className", () => {
    const view = render(
      <FilterChip pressed={false} count={0} className="ms-2">
        Missing
      </FilterChip>,
    );

    expect(view.get("button").className).toContain("ms-2");
  });

  describe("when unavailable", () => {
    function mount(onClick = vi.fn()) {
      return render(
        <FilterChip
          pressed={false}
          count={9}
          unavailable="Not available right now"
          onClick={onClick}
        >
          Review queue
        </FilterChip>,
      );
    }

    it("stays focusable and exposes the reason through a tooltip", () => {
      const view = mount();
      const chip = view.get<HTMLButtonElement>("button");

      expect(chip.disabled).toBe(false);
      expect(chip.getAttribute("aria-disabled")).toBe("true");
      expect(view.get("[role='tooltip']").textContent).toBe("Not available right now");
      expect(chip.getAttribute("aria-describedby")).toBe(view.get("[role='tooltip']").id);

      act(() => {
        chip.focus();
        chip.dispatchEvent(new Event("focusin", { bubbles: true }));
      });
      expect(view.get("[data-slot]").hasAttribute("data-open")).toBe(true);
    });

    it("keeps a pressed chip clickable, so a status chosen before its source failed can be removed", () => {
      const onClick = vi.fn();
      const view = render(
        <FilterChip pressed count={9} unavailable="Not available right now" onClick={onClick}>
          Review queue
        </FilterChip>,
      );
      const chip = view.get("button");

      click(chip);

      expect(onClick).toHaveBeenCalledTimes(1);
      expect(chip.hasAttribute("aria-disabled")).toBe(false);
      expect(chip.textContent).toBe("Review queue…");
      expect(view.get("[role='tooltip']").textContent).toBe("Not available right now");
    });

    it("ignores clicks and hides the count", () => {
      const onClick = vi.fn();
      const view = mount(onClick);

      click(view.get("button"));

      expect(onClick).not.toHaveBeenCalled();
      expect(view.get("button").textContent).toBe("Review queue…");
    });
  });
});
