// @vitest-environment jsdom
import type { ReactNode } from "react";
import type { Mock } from "vitest";
import { describe, expect, it, vi } from "vitest";
import { compactElapsed, rowBusyLabel } from "../client/review-in-flight.js";
import { ReviewRowActions } from "./ReviewRowActions.js";
import { arbitraryClasses, callerClasses, click, render } from "./test-support.js";

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

const busyText = (seconds: number): string =>
  `${rowBusyLabel("retranslate")}${compactElapsed(seconds)}`;

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

    expect(view.getByText("button", "Approve").dataset.variant).toBe("secondary-success");
    expect(view.getByText("button", "Reject…").dataset.variant).toBe("secondary-danger");
    for (const label of ["Edit", "Approve", "Reject…"]) {
      expect(arbitraryClasses(callerClasses(view.getByText("button", label)))).toEqual([]);
    }
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
      busyText(7),
    ]);
    expect(view.all("button").every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
    expect(view.get("[data-busy-elapsed]").textContent).toBe(compactElapsed(7));
    expect(view.get('[role="status"]').textContent).toBe("Retranslating…");
  });

  it("keeps the elapsed time inside the Retranslate button", () => {
    const view = render(
      <ReviewRowActions
        {...handlers()}
        onRetranslate={vi.fn()}
        busy={{ action: "retranslate", elapsedSeconds: 754 }}
      />,
    );

    const button = view.getByText("button", busyText(754));
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

    expect(view.getByText("button", "Rejecting…").dataset.variant).toBe("secondary-danger");
  });

  const reserved = (button: HTMLElement): string | undefined =>
    button.querySelector<HTMLElement>("[data-reserve]")?.dataset.reserve;

  it("reserves the other label's width on Approve and Reject, so the row never moves", () => {
    const view = render(<ReviewRowActions {...handlers()} />);

    expect(reserved(view.getByText("button", "Approve"))).toBe("Approving…");
    expect(reserved(view.getByText("button", "Reject…"))).toBe("Rejecting…");
    const busy = render(<ReviewRowActions {...handlers()} busy={{ action: "approve" }} />);
    const approving = busy.getByText("button", "Approving…");
    expect(reserved(approving)).toBe("Approve");
    expect(approving.getAttribute("aria-busy")).toBe("true");
    expect(view.getByText("button", "Approve").hasAttribute("aria-busy")).toBe(false);
  });

  it("adds no caller class to Retranslate beyond its busy opacity", () => {
    const view = render(<ReviewRowActions {...handlers()} onRetranslate={vi.fn()} />);

    expect(callerClasses(view.getByText("button", "Retranslate"))).toEqual([]);
  });

  it("sizes every row action at the compact size and keeps the status region empty", () => {
    const view = render(<ReviewRowActions {...handlers()} onRetranslate={vi.fn()} />);

    for (const label of ["Edit", "Approve", "Reject…", "Retranslate"]) {
      expect(view.getByText("button", label).dataset.size).toBe("xs");
    }
    expect(view.get('[role="status"]').textContent).toBe("");
  });

  it("reserves the busy label and a fixed elapsed slot, idle and busy alike", () => {
    const view = render(<ReviewRowActions {...handlers()} onRetranslate={vi.fn()} />);
    const idleButton = view.getByText("button", "Retranslate");
    const idleSlot = idleButton.querySelector<HTMLElement>("[data-busy-slot]");

    expect(reserved(idleButton)).toBe(rowBusyLabel("retranslate"));
    expect(idleSlot?.getAttribute("aria-hidden")).toBe("true");
    expect(idleSlot?.textContent).toBe("");
    view.rerender(
      <ReviewRowActions
        {...handlers()}
        onRetranslate={vi.fn()}
        busy={{ action: "retranslate", elapsedSeconds: 5 }}
      />,
    );
    const busySlot = view.get("[data-busy-elapsed]");

    expect(busySlot.hasAttribute("data-busy-slot")).toBe(true);
    expect(busySlot.hasAttribute("aria-hidden")).toBe(false);
    expect(busySlot.textContent).toBe(compactElapsed(5));
  });

  it("fits the longest elapsed text in the slot's five characters", () => {
    expect(compactElapsed(99 * 60 + 59).length).toBeLessThanOrEqual(5);
  });

  it("keeps a running Retranslate button at full opacity so its elapsed time stays readable", () => {
    const view = render(
      <ReviewRowActions
        {...handlers()}
        onRetranslate={vi.fn()}
        busy={{ action: "retranslate", elapsedSeconds: 5 }}
      />,
    );
    const busy = view.getByText("button", busyText(5));

    expect(busy.getAttribute("aria-busy")).toBe("true");
    expect((busy as HTMLButtonElement).disabled).toBe(true);
    expect(view.getByText("button", "Edit").hasAttribute("aria-busy")).toBe(false);
    expect(view.get("[data-busy-elapsed]").textContent).toBe(compactElapsed(5));
  });

  it("anchors the visually hidden status inside its own wrapper, so it never widens the page", () => {
    const view = render(<ReviewRowActions {...handlers()} />);

    expect(view.get('[role="status"]').parentElement).toBe(view.get("span[data-layout]"));
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

    expect(inline.get("span[data-layout]").dataset.layout).toBe("inline");
    expect(stacked.get("span[data-layout]").dataset.layout).toBe("wrap");
  });

  it("reserves a running retranslation's width in a table column, so a busy row never resizes it", () => {
    const reserves = (node: ReactNode): boolean =>
      render(node).get("span[data-layout]").hasAttribute("data-reserves-busy");

    expect(reserves(<ReviewRowActions {...handlers()} onRetranslate={vi.fn()} />)).toBe(true);
    expect(reserves(<ReviewRowActions {...handlers()} onRetranslate={vi.fn()} wrap />)).toBe(false);
    expect(reserves(<ReviewRowActions {...handlers()} />)).toBe(false);
  });
});
