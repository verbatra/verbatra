// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { ReviewBulkBar, type ReviewBulkBarProps } from "./ReviewBulkBar.js";
import { click, render } from "./test-support.js";

function props(overrides: Partial<ReviewBulkBarProps> = {}): ReviewBulkBarProps {
  return {
    count: 3,
    busy: false,
    decisionBlocker: null,
    retranslateBlocker: null,
    onApprove: vi.fn(),
    onReject: vi.fn(),
    onRetranslate: vi.fn(),
    onClear: vi.fn(),
    ...overrides,
  };
}

function button(view: ReturnType<typeof render>, name: string): HTMLButtonElement {
  return view.getByText("button", name) as HTMLButtonElement;
}

describe("ReviewBulkBar", () => {
  it("is a labelled region that counts the selection and offers every bulk action", () => {
    const view = render(<ReviewBulkBar {...props()} />);

    expect(view.get('[aria-label="Bulk actions"]').tagName).toBe("SECTION");
    expect(view.text()).toContain("3 selected");
    expect(view.all("button").map((element) => element.textContent)).toEqual([
      "Approve selected",
      "Reject selected…",
      "Retranslate selected",
      "Clear selection",
    ]);
  });

  it("calls the matching callback for each action", () => {
    const spies = props();
    const view = render(<ReviewBulkBar {...spies} />);

    click(button(view, "Approve selected"));
    click(button(view, "Reject selected…"));
    click(button(view, "Retranslate selected"));
    click(button(view, "Clear selection"));

    expect(spies.onApprove).toHaveBeenCalledTimes(1);
    expect(spies.onReject).toHaveBeenCalledTimes(1);
    expect(spies.onRetranslate).toHaveBeenCalledTimes(1);
    expect(spies.onClear).toHaveBeenCalledTimes(1);
  });

  it("leaves Retranslate out without a retranslate callback, and ignores its blocker", () => {
    const view = render(
      <ReviewBulkBar {...props({ onRetranslate: undefined, retranslateBlocker: "too many" })} />,
    );

    expect(view.text()).not.toContain("Retranslate selected");
    expect(view.text()).not.toContain("too many");
  });

  it("disables what a blocker forbids and says why", () => {
    const view = render(
      <ReviewBulkBar
        {...props({ decisionBlocker: "Values are loading.", retranslateBlocker: "Too many." })}
      />,
    );

    expect(button(view, "Approve selected").disabled).toBe(true);
    expect(button(view, "Reject selected…").disabled).toBe(true);
    expect(button(view, "Retranslate selected").disabled).toBe(true);
    expect(button(view, "Clear selection").disabled).toBe(false);
    expect(view.text()).toContain("Values are loading. Too many.");
  });

  it("disables every action while a bulk action runs", () => {
    const view = render(<ReviewBulkBar {...props({ busy: true })} />);

    for (const element of view.all("button")) {
      expect((element as HTMLButtonElement).disabled).toBe(true);
    }
  });
});
