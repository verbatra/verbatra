// @vitest-environment jsdom
import type { Mock } from "vitest";
import { describe, expect, it, vi } from "vitest";
import { ReviewRowActions } from "./ReviewRowActions.js";
import { click, render } from "./test-support.js";

interface Handlers {
  readonly onApprove: Mock<() => void>;
  readonly onReject: Mock<() => void>;
  readonly onEdit: Mock<() => void>;
}

function handlers(): Handlers {
  return {
    onApprove: vi.fn<() => void>(),
    onReject: vi.fn<() => void>(),
    onEdit: vi.fn<() => void>(),
  };
}

describe("ReviewRowActions", () => {
  it("offers exactly the three row actions, with Edit first", () => {
    const view = render(<ReviewRowActions {...handlers()} />);

    expect(view.all("button").map((button) => button.textContent)).toEqual([
      "Edit",
      "Approve",
      "Reject…",
    ]);
  });

  it("calls only the edit callback when Edit is pressed", () => {
    const spies = handlers();
    const view = render(<ReviewRowActions {...spies} />);

    click(view.getByText("button", "Edit"));

    expect(spies.onEdit).toHaveBeenCalledTimes(1);
    expect(spies.onApprove).not.toHaveBeenCalled();
    expect(spies.onReject).not.toHaveBeenCalled();
  });

  it("calls only the approve callback when Approve is pressed", () => {
    const spies = handlers();
    const view = render(<ReviewRowActions {...spies} />);

    click(view.getByText("button", "Approve"));

    expect(spies.onApprove).toHaveBeenCalledTimes(1);
    expect(spies.onReject).not.toHaveBeenCalled();
    expect(spies.onEdit).not.toHaveBeenCalled();
  });

  it("calls only the reject callback when Reject is pressed", () => {
    const spies = handlers();
    const view = render(<ReviewRowActions {...spies} />);

    click(view.getByText("button", "Reject…"));

    expect(spies.onReject).toHaveBeenCalledTimes(1);
    expect(spies.onApprove).not.toHaveBeenCalled();
    expect(spies.onEdit).not.toHaveBeenCalled();
  });

  it("tints approve and reject apart, so the two outcomes are not one undifferentiated pair", () => {
    const view = render(<ReviewRowActions {...handlers()} />);

    expect(view.getByText("button", "Approve").className).toContain("text-success");
    expect(view.getByText("button", "Reject…").className).toContain("text-danger");
  });

  it("uses non-submitting buttons, since a review row can sit inside a form", () => {
    const view = render(<ReviewRowActions {...handlers()} />);

    for (const button of view.all("button")) {
      expect(button.getAttribute("type")).toBe("button");
    }
  });

  it("disables approve and reject, never edit, while no decision can be made", () => {
    const spies = handlers();
    const view = render(<ReviewRowActions {...spies} decisionDisabled />);

    click(view.getByText("button", "Approve"));
    click(view.getByText("button", "Reject…"));
    click(view.getByText("button", "Edit"));

    expect(spies.onApprove).not.toHaveBeenCalled();
    expect(spies.onReject).not.toHaveBeenCalled();
    expect(spies.onEdit).toHaveBeenCalledTimes(1);
  });

  it("shows the pending decision inside the Approve button and announces it, disabling every action", () => {
    const spies = handlers();
    const view = render(<ReviewRowActions {...spies} pendingLabel="Approving…" />);

    for (const name of ["Edit", "Approving…", "Reject…"]) {
      expect((view.getByText("button", name) as HTMLButtonElement).disabled).toBe(true);
    }
    expect(view.get('[role="status"]').textContent).toBe("Approving…");
    expect(view.get('[role="status"]').className).toContain("sr-only");
  });

  it("keeps the Approve button at one width and every action on one line", () => {
    const idle = render(<ReviewRowActions {...handlers()} />);
    const busy = render(<ReviewRowActions {...handlers()} pendingLabel="Approving…" />);

    expect(idle.getByText("button", "Approve").className).toContain("min-w-[5.75rem]");
    expect(busy.getByText("button", "Approving…").className).toContain("min-w-[5.75rem]");
    expect(idle.get("span").className).toContain("whitespace-nowrap");
    expect(idle.get("span").className).not.toContain("flex-wrap");
    expect(idle.get('[role="status"]').textContent).toBe("");
  });
});
