// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { SegmentedControl, type SegmentedItem } from "./segmented-control.tsx";
import { click, render } from "./test-support.tsx";

type PanelId = "overview" | "review" | "history";

const ITEMS: readonly SegmentedItem<PanelId>[] = [
  { id: "overview", label: "Overview" },
  { id: "review", label: "Review" },
  { id: "history", label: "History" },
];

function mount(active: PanelId, onChange: (id: PanelId) => void = () => {}) {
  return render(
    <SegmentedControl items={ITEMS} active={active} onChange={onChange} label="Panels" />,
  );
}

describe("SegmentedControl", () => {
  it("renders one segment per item, in order, inside a named group", () => {
    const view = mount("overview");

    expect(view.all("button").map((button) => button.textContent)).toEqual([
      "Overview",
      "Review",
      "History",
    ]);
    expect(view.get("fieldset").getAttribute("aria-label")).toBe("Panels");
  });

  it("marks only the active segment as pressed", () => {
    const view = mount("review");

    expect(view.all("button").map((button) => button.getAttribute("aria-pressed"))).toEqual([
      "false",
      "true",
      "false",
    ]);
  });

  it("lifts the active segment onto a raised surface with a visible border", () => {
    const buttons = mount("review").all("button");

    expect(buttons[1]?.className).toContain("bg-(--surface-raised)");
    expect(buttons[1]?.className).toContain("border-(--border-field)");
    expect(buttons[0]?.className).not.toContain("bg-(--surface-raised)");
    expect(buttons[0]?.className).toContain("hover:text-(--text-strong)");
  });

  it("reports the pressed segment, including the already active one", () => {
    const onChange = vi.fn();
    const view = mount("overview", onChange);

    click(view.getByText("button", "History"));
    click(view.getByText("button", "Overview"));

    expect(onChange).toHaveBeenNthCalledWith(1, "history");
    expect(onChange).toHaveBeenNthCalledWith(2, "overview");
  });

  it("leaves the active segment to the caller", () => {
    const view = mount("overview");

    click(view.getByText("button", "History"));

    expect(view.getByText("button", "Overview").getAttribute("aria-pressed")).toBe("true");
  });

  it("uses non-submitting buttons and survives having no items", () => {
    for (const button of mount("overview").all("button")) {
      expect(button.getAttribute("type")).toBe("button");
    }
    const empty = render(
      <SegmentedControl items={[]} active={"overview" as PanelId} onChange={() => {}} label="x" />,
    );
    expect(empty.all("button")).toHaveLength(0);
  });
});
