// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { BatchSummary } from "../client/review-batch-outcome.js";
import { ReviewDecisionStatus, VISIBLE_FAILURE_ENTRIES } from "./ReviewDecisionStatus.js";
import { click, render } from "./test-support.js";

function failures(count: number, message: (index: number) => string): BatchSummary {
  return {
    kind: "done",
    action: "approve",
    succeeded: 0,
    failures: Array.from({ length: count }, (_, index) => ({
      locale: "de",
      key: `k${index}`,
      message: message(index),
    })),
  };
}

describe("ReviewDecisionStatus", () => {
  it("renders nothing but an empty live region before any decision", () => {
    const view = render(<ReviewDecisionStatus notice={null} />);

    expect(view.get("[data-decision-status]").getAttribute("role")).toBe("status");
    expect(view.text()).toBe("");
  });

  it.each([
    ["rejected", "Rejected k (de). Its translation was removed"],
    ["retranslated", "Retranslated k (de)."],
    ["updated", "Updated k (de)."],
    ["already-running", "k (de) is already being retranslated."],
  ] as const)("describes a %s entry", (kind, text) => {
    const view = render(<ReviewDecisionStatus notice={{ kind, locale: "de", key: "k" }} />);

    expect(view.text()).toContain(text);
  });

  it("names the cause of each failed group once and lists its keys", () => {
    const view = render(
      <ReviewDecisionStatus
        notice={{
          kind: "batch",
          summary: failures(3, (index) => (index < 2 ? "Value changed." : "Locked.")),
        }}
      />,
    );

    expect(view.get("[data-decision-status]").getAttribute("role")).toBe("alert");
    expect(view.all("[data-batch-failures] li").map((item) => item.textContent)).toEqual([
      "Value changed.k0 (de), k1 (de)",
      "Locked.k2 (de)",
    ]);
    expect(view.query("button")).toBeNull();
  });

  it("caps a long failure list behind an expander", () => {
    const view = render(
      <ReviewDecisionStatus
        notice={{
          kind: "batch",
          summary: failures(VISIBLE_FAILURE_ENTRIES + 3, (index) => `Cause ${index % 2}.`),
        }}
      />,
    );
    const listedKeys = (): number =>
      view
        .all("[data-batch-failures] li")
        .reduce(
          (total, item) => total + (item.lastElementChild?.textContent?.split(",").length ?? 0),
          0,
        );

    expect(listedKeys()).toBe(VISIBLE_FAILURE_ENTRIES);
    const toggle = view.get("button");
    expect(toggle.textContent).toBe(`Show all ${VISIBLE_FAILURE_ENTRIES + 3}`);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    click(toggle);

    expect(listedKeys()).toBe(VISIBLE_FAILURE_ENTRIES + 3);
    expect(view.get("button").textContent).toBe("Show fewer");
  });

  it("reports a whole-batch error without a list", () => {
    const view = render(
      <ReviewDecisionStatus
        notice={{
          kind: "batch",
          summary: { kind: "error", action: "reject", message: "Rate limited." },
        }}
      />,
    );

    expect(view.text()).toBe("Could not reject the selected entries: Rate limited.");
    expect(view.query("[data-batch-failures]")).toBeNull();
  });
});
