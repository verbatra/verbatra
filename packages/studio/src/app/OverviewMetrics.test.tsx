// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { StatusData } from "../client/coverage.js";
import type { DiffLocale } from "../client/diff-view.js";
import type { RefreshableView } from "../client/state.js";
import { OverviewMetrics } from "./OverviewMetrics.js";
import { metricCard, metricFigure, metricHint, render } from "./test-support.js";
import type { DiffState } from "./use-diff-state.js";

const DRIFTING: DiffLocale = {
  locale: "de",
  missing: ["a.b"],
  changed: [],
  orphaned: [],
  hasPendingChanges: true,
};

const LOADED_DIFF: DiffState = { kind: "loaded", hasPendingChanges: true, locales: [DRIFTING] };

const STATUS: RefreshableView<StatusData> = {
  kind: "data",
  stale: false,
  data: {
    inSync: false,
    rows: [{ locale: "de", missing: 1, stale: 0, upToDate: 9, percent: 90, inSync: false }],
  },
};

describe("OverviewMetrics", () => {
  it("links the attention hint to the missing, changed and orphaned keys, and nothing else", () => {
    const view = render(<OverviewMetrics status={STATUS} diff={LOADED_DIFF} />);
    const links = metricCard(view, "Needs attention").querySelectorAll("a");

    expect([...links].map((link) => link.getAttribute("href"))).toEqual([
      "#/translations?status=missing&status=changed&status=orphaned",
    ]);
  });

  it("shows placeholders for every figure while both reads are open", () => {
    const view = render(
      <OverviewMetrics status={{ kind: "loading" }} diff={{ kind: "loading" }} />,
    );

    expect(metricFigure(view, "Needs attention").textContent).toBe("…");
    expect(metricFigure(view, "Avg coverage").textContent).toBe("…");
    expect(metricFigure(view, "Locales in sync").textContent).toBe("…");
    expect(metricHint(view, "Locales in sync")).toBe("Loading sync state.");
  });

  it("shows N/A for the attention figure when the pending-change check failed", () => {
    const view = render(
      <OverviewMetrics
        status={STATUS}
        diff={{ kind: "error", error: { code: "INTERNAL", message: "boom" } }}
      />,
    );

    expect(metricFigure(view, "Needs attention").textContent).toBe("N/A");
    expect(metricCard(view, "Needs attention").querySelector("a")).toBeNull();
  });

  it("marks the three figures as tabular sans numerals", () => {
    const view = render(<OverviewMetrics status={STATUS} diff={LOADED_DIFF} />);

    for (const label of ["Needs attention", "Avg coverage", "Locales in sync"]) {
      const figure = metricFigure(view, label);
      expect(figure.hasAttribute("data-figure")).toBe(true);
      expect(figure.className).not.toContain("font-mono");
    }
  });

  it("stacks the three tiles in one column on the narrowest screens so a label never splits", () => {
    const view = render(<OverviewMetrics status={STATUS} diff={LOADED_DIFF} />);
    const grid = metricCard(view, "Needs attention").parentElement;
    const syncWrapper = metricCard(view, "Locales in sync").parentElement;

    expect(grid?.className).toContain("grid-cols-1");
    expect(grid?.className).toContain("min-[360px]:grid-cols-2");
    expect(syncWrapper?.className).toContain("min-[360px]:col-span-2");
  });

  it("states a locale count that reads in the singular for one locale", () => {
    const view = render(<OverviewMetrics status={STATUS} diff={LOADED_DIFF} />);

    expect(metricHint(view, "Avg coverage")).toBe("Across 1 target locale.");
  });
});
