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

  it("tints approve and reject apart through the tinted button variants", () => {
    const view = render(<ReviewRowActions {...handlers()} />);

    expect(view.getByText("button", "Approve").className).toContain("text-success");
    expect(view.getByText("button", "Reject…").className).toContain("text-danger");
    expect(view.getByText("button", "Approve").className).not.toContain("[");
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

  it("shows a running approval on the Approve button and announces it, disabling every action", () => {
    const view = render(<ReviewRowActions {...handlers()} busy={{ action: "approve" }} />);

    for (const name of ["Edit", "Approving…", "Reject…"]) {
      expect((view.getByText("button", name) as HTMLButtonElement).disabled).toBe(true);
    }
    expect(view.get('[role="status"]').textContent).toBe("Approving…");
    expect(view.get('[role="status"]').className).toContain("sr-only");
  });

  it("shows a running retranslation on the Retranslate button, never on Approve", () => {
    const view = render(
      <ReviewRowActions
        {...handlers()}
        onRetranslate={vi.fn()}
        busy={{ action: "retranslate", elapsedSeconds: 7 }}
      />,
    );

    expect(view.all("button").map((button) => button.textContent)).toEqual([
      "Edit",
      "Approve",
      "Reject…",
      "Retranslating… 7s",
    ]);
    expect(view.all("button").every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
    expect(view.get("[data-busy-elapsed]").className).toContain("tabular-nums");
    expect(view.get('[role="status"]').textContent).toBe("Retranslating…");
  });

  it("keeps the elapsed time inside the fixed-width Retranslate button", () => {
    const view = render(
      <ReviewRowActions
        {...handlers()}
        onRetranslate={vi.fn()}
        busy={{ action: "retranslate", elapsedSeconds: 754 }}
      />,
    );

    const button = view.getByText("button", "Retranslating… 12:34");
    expect(button.className).toContain("min-w-40");
    expect(button.contains(view.get("[data-busy-elapsed]"))).toBe(true);
  });

  it("announces a running retranslation at the start and then every fifteen seconds only", () => {
    const status = (seconds: number): string =>
      render(
        <ReviewRowActions
          {...handlers()}
          onRetranslate={vi.fn()}
          busy={{ action: "retranslate", elapsedSeconds: seconds }}
        />,
      ).get('[role="status"]').textContent ?? "";

    expect(status(0)).toBe("Retranslating…");
    expect(status(14)).toBe("Retranslating…");
    expect(status(16)).toBe("Retranslating… 15 seconds so far");
    expect(status(31)).toBe("Retranslating… 30 seconds so far");
  });

  it("shows no elapsed time on a retranslation whose start is unknown", () => {
    const view = render(
      <ReviewRowActions {...handlers()} onRetranslate={vi.fn()} busy={{ action: "retranslate" }} />,
    );

    expect(view.query("[data-busy-elapsed]")).toBeNull();
    expect(view.getByText("button", "Retranslating…")).toBeDefined();
  });

  it("shows a running bulk rejection on the Reject button", () => {
    const view = render(<ReviewRowActions {...handlers()} busy={{ action: "reject" }} />);

    expect(view.getByText("button", "Rejecting…").className).toContain("w-24");
  });

  it("reserves a fixed width for each labelled action so a busy label never moves the row", () => {
    const view = render(<ReviewRowActions {...handlers()} onRetranslate={vi.fn()} />);

    expect(view.getByText("button", "Edit").className.split(" ")).toContain("w-12");
    expect(view.getByText("button", "Approve").className).toContain("w-24");
    expect(view.getByText("button", "Reject…").className).toContain("w-24");
    expect(view.get('[role="status"]').textContent).toBe("");
  });

  it("lets an idle Retranslate button hug its label and widens it only while it runs", () => {
    const view = render(<ReviewRowActions {...handlers()} onRetranslate={vi.fn()} />);
    const idle = view.getByText("button", "Retranslate").className.split(" ");

    expect(idle).toContain("min-w-0");
    expect(idle).not.toContain("min-w-40");
    expect(idle).not.toContain("w-40");
    expect(idle).toContain("transition-[min-width]");
    expect(idle).toContain("motion-reduce:transition-none");

    view.rerender(
      <ReviewRowActions
        {...handlers()}
        onRetranslate={vi.fn()}
        busy={{ action: "retranslate", elapsedSeconds: 5 }}
      />,
    );
    const busy = view.getByText("button", "Retranslating… 5s").className.split(" ");

    expect(busy).toContain("min-w-40");
    expect(busy).not.toContain("min-w-0");
  });

  it("keeps a running Retranslate button at full opacity so its elapsed time stays readable", () => {
    const view = render(
      <ReviewRowActions
        {...handlers()}
        onRetranslate={vi.fn()}
        busy={{ action: "retranslate", elapsedSeconds: 5 }}
      />,
    );
    const busy = view.getByText("button", "Retranslating… 5s").className.split(" ");

    expect(busy).toContain("disabled:opacity-100");
    expect(busy).not.toContain("disabled:opacity-60");
    expect(view.getByText("button", "Edit").className.split(" ")).toContain("disabled:opacity-60");
    expect(view.get("[data-busy-elapsed]").className.split(" ")).toContain("text-muted-foreground");
  });

  it("anchors the visually hidden status inside its own wrapper, so it never widens the page", () => {
    const view = render(<ReviewRowActions {...handlers()} />);

    expect(view.get("span").className).toContain("relative");
    expect(view.get('[role="status"]').parentElement).toBe(view.get("span"));
  });

  it("adds a Retranslate action last only when a retranslate callback is given", () => {
    const onRetranslate = vi.fn<() => void>();
    const view = render(<ReviewRowActions {...handlers()} onRetranslate={onRetranslate} />);

    expect(view.all("button").map((button) => button.textContent)).toEqual([
      "Edit",
      "Approve",
      "Reject…",
      "Retranslate",
    ]);
    click(view.getByText("button", "Retranslate"));
    expect(onRetranslate).toHaveBeenCalledTimes(1);
  });

  it("disables Retranslate while a decision is pending", () => {
    const view = render(
      <ReviewRowActions {...handlers()} onRetranslate={vi.fn()} busy={{ action: "approve" }} />,
    );

    expect((view.getByText("button", "Retranslate") as HTMLButtonElement).disabled).toBe(true);
  });

  it("names each action's keyboard shortcut only on the active row", () => {
    const active = render(
      <ReviewRowActions {...handlers()} onRetranslate={vi.fn()} shortcutsActive />,
    );
    const inactive = render(<ReviewRowActions {...handlers()} onRetranslate={vi.fn()} />);

    expect(active.all("button").map((button) => button.getAttribute("aria-keyshortcuts"))).toEqual([
      "e Enter",
      "a",
      "r",
      "t",
    ]);
    expect(inactive.all("button").some((button) => button.hasAttribute("aria-keyshortcuts"))).toBe(
      false,
    );
  });
});

describe("ReviewRowActions: layout", () => {
  it("keeps the actions on one line in a table column and lets them wrap when stacked", () => {
    const inline = render(
      <ReviewRowActions onApprove={vi.fn()} onReject={vi.fn()} onEdit={vi.fn()} />,
    );
    const stacked = render(
      <ReviewRowActions onApprove={vi.fn()} onReject={vi.fn()} onEdit={vi.fn()} wrap />,
    );

    expect(inline.get("span").className).toContain("flex-nowrap");
    expect(stacked.get("span").className).toContain("flex-wrap");
  });

  it("reserves a running retranslation's width in a table column, so a busy row never resizes it", () => {
    const withRetranslate = render(<ReviewRowActions {...handlers()} onRetranslate={vi.fn()} />)
      .get("span")
      .className.split(" ");
    const stacked = render(<ReviewRowActions {...handlers()} onRetranslate={vi.fn()} wrap />)
      .get("span")
      .className.split(" ");
    const withoutRetranslate = render(<ReviewRowActions {...handlers()} />)
      .get("span")
      .className.split(" ");

    expect(withRetranslate).toContain("min-w-106");
    expect(stacked).not.toContain("min-w-106");
    expect(withoutRetranslate).not.toContain("min-w-106");
  });
});
