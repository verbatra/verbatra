// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { StatusData } from "../client/coverage.js";
import type { DiffLocale } from "../client/diff-view.js";
import type { RefreshableView } from "../client/state.js";
import { OverviewMetrics } from "./OverviewMetrics.js";
import {
  metricCard,
  metricFigure,
  metricHint,
  render,
  reviewQueueView,
  unavailableQueueView,
} from "./test-support.js";
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

  it("defines the named breakpoint the tile grids use, so no arbitrary pixel variant is needed", () => {
    const styles = readFileSync(resolve(process.cwd(), "src/app/styles.css"), "utf8");
    const view = render(
      <OverviewMetrics status={STATUS} diff={LOADED_DIFF} reviewQueue={reviewQueueView(4)} />,
    );
    const classes = view.all("*").flatMap((node) => node.className.toString().split(" "));

    expect(styles).toMatch(/--breakpoint-xs:\s*\d/);
    expect(classes.filter((name) => name.includes("min-["))).toEqual([]);
  });

  it("puts the review tile between attention and coverage and adds a fourth tile", () => {
    const view = render(
      <OverviewMetrics status={STATUS} diff={LOADED_DIFF} reviewQueue={reviewQueueView(4)} />,
    );

    expect(view.all('[role="group"]')).toHaveLength(4);
    expect(metricHint(view, "Waiting for review")).toBe("4 translations wait for review.");
  });

  it("shows N/A with a check-failed hint for coverage and sync when the status read failed", () => {
    const view = render(
      <OverviewMetrics
        status={{ kind: "error", error: { code: "INTERNAL", message: "x" } }}
        diff={LOADED_DIFF}
      />,
    );

    expect(metricFigure(view, "Avg coverage").textContent).toBe("N/A");
    expect(metricHint(view, "Avg coverage")).toBe("The coverage check failed.");
    expect(metricFigure(view, "Locales in sync").textContent).toBe("N/A");
    expect(metricHint(view, "Locales in sync")).toBe("The sync check failed.");
  });

  it("keeps the last known figures when the status read is stale", () => {
    const stale: RefreshableView<StatusData> = {
      kind: "data",
      stale: true,
      error: { code: "INTERNAL", message: "x" },
      data: STATUS.kind === "data" ? STATUS.data : { inSync: false, rows: [] },
    };
    const view = render(<OverviewMetrics status={stale} diff={LOADED_DIFF} />);

    expect(metricFigure(view, "Avg coverage").textContent).toBe("90%");
  });

  it("states a locale count that reads in the singular for one locale", () => {
    const view = render(<OverviewMetrics status={STATUS} diff={LOADED_DIFF} />);

    expect(metricHint(view, "Avg coverage")).toBe("Across 1 target locale.");
  });

  it("shows N/A with the reason, never a count or a success tone, when the review state is unreadable", () => {
    const view = render(
      <OverviewMetrics status={STATUS} diff={LOADED_DIFF} reviewQueue={unavailableQueueView()} />,
    );

    expect(metricFigure(view, "Waiting for review").textContent).toBe("N/A");
    expect(metricFigure(view, "Waiting for review").className).not.toContain("text-success");
    expect(metricHint(view, "Waiting for review")).toBe(
      "verbatra.provenance.json is corrupt or too new to read.",
    );
    expect(metricCard(view, "Waiting for review").querySelector("a")).toBeNull();
  });

  it("counts an orphaned key once even when two locales hold it", () => {
    const twice: DiffState = {
      kind: "loaded",
      hasPendingChanges: false,
      locales: [
        { locale: "de", missing: [], changed: [], orphaned: ["old.key"], hasPendingChanges: false },
        { locale: "fr", missing: [], changed: [], orphaned: ["old.key"], hasPendingChanges: false },
      ],
    };
    const synced: RefreshableView<StatusData> = {
      kind: "data",
      stale: false,
      data: { inSync: true, rows: [] },
    };

    const view = render(<OverviewMetrics status={synced} diff={twice} />);

    expect(metricHint(view, "Locales in sync")).toBe(
      "Every key is translated; 1 orphaned key is left over.",
    );
    expect(metricHint(view, "Needs attention")).toContain("1 key is missing, changed or orphaned");
  });

  it("formats large counts in the attention and review hints", () => {
    const keys = Array.from({ length: 1500 }, (_, index) => `k${index}`);
    const big: DiffState = {
      kind: "loaded",
      hasPendingChanges: true,
      locales: [
        { locale: "de", missing: keys, changed: [], orphaned: [], hasPendingChanges: true },
      ],
    };

    const view = render(
      <OverviewMetrics status={STATUS} diff={big} reviewQueue={reviewQueueView(1200)} />,
    );

    expect(metricHint(view, "Needs attention")).toContain("1,500 keys are missing");
    expect(metricHint(view, "Waiting for review")).toBe("1,200 translations wait for review.");
  });
});
