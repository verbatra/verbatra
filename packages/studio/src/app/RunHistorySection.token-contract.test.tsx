// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { recordAt } from "../client/run-history-test-support.js";
import { RunHistorySection } from "./RunHistorySection.js";
import { render } from "./test-support.js";

vi.mock("../client/run-history-view.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../client/run-history-view.js")>()),
  describeTokens: () => ({
    reported: true,
    total: undefined,
    input: undefined,
    output: undefined,
    lowerBound: false,
  }),
}));

describe("a reported token count with no figures", () => {
  it("is drawn as zero in the table and the chart rather than as a missing figure", () => {
    const view = render(
      <RunHistorySection
        view={{
          kind: "data",
          stale: false,
          data: { records: [recordAt("2026-07-01T10:00:00.000Z")], total: 1, unreadableRecords: 0 },
        }}
        hideCode={undefined}
      />,
    );
    const charts = view.all("figure").map((figure) => figure.outerHTML);

    expect(view.get('[aria-label="Recorded runs"] tbody').textContent).toContain("0 in / 0 out");
    expect(charts.join("")).toContain(": 0");
    expect(view.text()).not.toContain("not reported");
  });
});
