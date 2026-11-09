// @vitest-environment jsdom
import type { RunHistoryCost } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import { localeEntry, PRICED, recordAt } from "../client/run-history-test-support.js";
import type { RunHistoryData } from "../client/run-history-view.js";
import type { RefreshableView } from "../client/state.js";
import { INITIAL_RUN_ROWS, RunHistorySection } from "./RunHistorySection.js";
import { click, render } from "./test-support.js";

function data(
  records: RunHistoryData["records"],
  extra: Partial<RunHistoryData> = {},
): RefreshableView<RunHistoryData> {
  return {
    kind: "data",
    stale: false,
    data: { records, total: records.length, unreadableRecords: 0, ...extra },
  };
}

function section(view: RefreshableView<RunHistoryData>, hideCode?: string) {
  return render(<RunHistorySection view={view} hideCode={hideCode} />);
}

const T1 = "2026-07-01T10:00:00.000Z";
const T2 = "2026-07-02T10:00:00.000Z";
const T3 = "2026-07-03T10:00:00.000Z";

describe("RunHistorySection states", () => {
  it("shows a loading status while the first read is open", () => {
    const view = section({ kind: "loading" });

    expect(view.text()).toContain("Loading...");
  });

  it("explains an empty history and draws no chart and no table", () => {
    const view = section(data([]));

    expect(view.text()).toContain("No runs recorded yet");
    expect(view.query("figure")).toBeNull();
    expect(view.query("table")).toBeNull();
  });

  it("shows a corrupt file as its unreadable count with no runs, and promises the rewrite", () => {
    const view = section(data([], { unreadableRecords: 3 }));

    expect(view.text()).toContain("3 records could not be read and are left out.");
    expect(view.text()).toContain("rewrites the file without them");
    expect(view.text()).toContain("No runs recorded yet");
  });

  it("says a single unreadable record in the singular", () => {
    const view = section(data([recordAt(T1)], { unreadableRecords: 1 }));

    expect(view.text()).toContain("1 record could not be read and is left out.");
    expect(view.query("table")).not.toBeNull();
  });

  it("warns that an unreadable or oversized file is not proof that no run happened", () => {
    const unreadable = section(data([], { unavailable: "unreadable" }));
    const large = section(data([], { unavailable: "too-large" }));

    expect(unreadable.text()).toContain("not proof that no run happened");
    expect(large.text()).toContain("over 8 MiB");
  });

  it("says when only the newest records are shown", () => {
    const view = section(data([recordAt(T1)], { total: 120 }));

    expect(view.text()).toContain("Showing the newest 1 of 120 recorded runs.");
  });

  it("shows the page-alert stand-in instead of a second alert when the page already shows that error", () => {
    const view = section(
      { kind: "error", error: { code: "INTERNAL", message: "boom" } },
      "INTERNAL",
    );

    expect(view.text()).toContain("Run history is unavailable. See the error above.");
    expect(view.query('[role="alert"]')).toBeNull();
  });

  it("shows its own alert for an error the page alert does not carry", () => {
    const view = section({ kind: "error", error: { code: "INTERNAL", message: "boom" } });

    expect(view.query('[role="alert"]')).not.toBeNull();
  });

  it("keeps the last known history under a stale notice, unless the page alert carries that error", () => {
    const stale: RefreshableView<RunHistoryData> = {
      kind: "data",
      stale: true,
      error: { code: "INTERNAL", message: "boom" },
      data: { records: [recordAt(T1)], total: 1, unreadableRecords: 0 },
    };

    const own = section(stale);
    const hidden = section(stale, "INTERNAL");

    expect(own.text()).toContain("Showing the last known run history.");
    expect(own.query("table")).not.toBeNull();
    expect(hidden.query('[role="alert"]')).toBeNull();
    expect(hidden.query("table")).not.toBeNull();
  });
});

describe("RunHistorySection cost states", () => {
  const cases: readonly {
    readonly name: string;
    readonly cost: RunHistoryCost;
    readonly shows: readonly string[];
  }[] = [
    { name: "priced", cost: PRICED, shows: ["$0.50"] },
    {
      name: "source characters",
      cost: {
        ...PRICED,
        basis: "source-characters",
        caveats: ["SOURCE_DUPLICATES_NOT_DEDUPLICATED", "TRANSPORT_RETRIES_NOT_COUNTED"],
      } as RunHistoryCost,
      shows: [
        "estimated $0.50",
        "Repeated source strings are counted every time.",
        "Retried requests are not counted.",
        "Keys the provider failed on are not counted.",
      ],
    },
    {
      name: "usage partial",
      cost: { ...PRICED, caveats: ["USAGE_PARTIAL"] } as RunHistoryCost,
      shows: ["at least $0.50", "lower bound"],
    },
    {
      name: "no rate",
      cost: { pricing: "no-rate-on-file", basis: "usage", rateKey: "openai/x" },
      shows: ["no rate", "No rate is on file for openai/x."],
    },
    {
      name: "no usage",
      cost: { pricing: "no-usage", basis: "usage", rateKey: "openai/x" },
      shows: ["unknown", "provider reported no tokens"],
    },
    {
      name: "not billed, with no basis",
      cost: { pricing: "not-billed", rateKey: "libretranslate" },
      shows: ["not billed"],
    },
  ];

  it.each(cases)("renders the $name cost honestly", ({ cost, shows }) => {
    const view = section(data([recordAt(T1, { cost })]));
    const table = view.get("table").textContent ?? "";

    for (const text of shows) {
      expect(table).toContain(text);
    }
  });

  it("never prints a free or zero amount for a run that had no figure", () => {
    const view = section(
      data([recordAt(T1, { cost: { pricing: "no-usage", basis: "usage", rateKey: "x" } })]),
    );

    expect(view.get("table").textContent).not.toMatch(/\$0|free/);
  });
});

describe("RunHistorySection table and charts", () => {
  it("always renders the table alternative next to the charts, newest run first", () => {
    const view = section(
      data([recordAt(T3, { trigger: "retranslate", entries: 2 }), recordAt(T2), recordAt(T1)]),
    );

    expect(view.all("svg")).toHaveLength(2);
    expect(view.get("table caption").textContent).toBe("Recorded runs, newest first");
    const rows = view.all("tbody tr");
    expect(rows[0]?.textContent).toContain("Retranslate, 2 entries");
    expect(rows[2]?.textContent).toContain("Translate");
  });

  it("describes each chart for assistive technology and gives each point its figure", () => {
    const view = section(data([recordAt(T2), recordAt(T1)]));

    const [cost, tokens] = view.all("svg");
    const costTitle = cost?.getAttribute("aria-labelledby");
    expect(view.get(`#${CSS.escape(costTitle ?? "")}`).textContent).toBe(
      "Cost per run (USD), 2 of 2 runs, oldest to newest",
    );
    expect(tokens?.querySelectorAll("rect")).toHaveLength(2);
    expect(cost?.querySelectorAll("circle title")[0]?.textContent).toContain("$0.50");
    expect(cost?.querySelector("polyline")?.getAttribute("points")).not.toBe("");
  });

  it("writes the chart with attributes and token classes only, never a style attribute or a style element", () => {
    const view = section(
      data([
        recordAt(T2),
        recordAt(T1, { cost: { ...PRICED, basis: "source-characters" } as RunHistoryCost }),
      ]),
    );

    expect(view.container.querySelectorAll("style")).toHaveLength(0);
    expect(view.container.querySelectorAll("[style]")).toHaveLength(0);
    expect(view.container.querySelector("circle.fill-card")).not.toBeNull();
    expect(view.text()).toContain("A hollow point is an estimate or a lower bound.");
  });

  it("draws nothing, and says so, for a series with no figure", () => {
    const view = section(
      data([recordAt(T1, { usage: undefined, cost: { pricing: "not-billed", rateKey: "x" } })]),
    );

    expect(view.query("svg")).toBeNull();
    expect(view.all("figure")).toHaveLength(2);
    expect(view.text()).toContain("Nothing to draw");
  });

  it("names how many runs in another currency are left out of the cost trend", () => {
    const view = section(
      data([
        recordAt(T2, { cost: { ...PRICED, currency: "EUR" } as RunHistoryCost }),
        recordAt(T1),
      ]),
    );

    expect(view.text()).toContain("1 run in another currency is not drawn.");
  });

  it("shows more rows a page at a time", () => {
    const records = Array.from({ length: INITIAL_RUN_ROWS + 5 }, (_, index) =>
      recordAt(new Date(Date.UTC(2026, 6, 1, 0, index)).toISOString()),
    );
    const view = section(data(records));
    expect(view.all("tbody tr").length).toBe(INITIAL_RUN_ROWS);

    const more = view.getByText("button", "Show more runs");
    click(more);

    expect(view.all("tbody tr").length).toBe(INITIAL_RUN_ROWS + 5);
    expect(view.query("button")).toBeNull();
  });

  it("shows tokens or says they were not reported", () => {
    const view = section(data([recordAt(T2, { usage: undefined }), recordAt(T1)]));
    const rows = view.all("tbody tr");

    expect(rows[0]?.textContent).toContain("not reported");
    expect(rows[1]?.textContent).toContain("100 in / 50 out");
  });

  it("summarises what a run did, naming only the counters that are not zero", () => {
    const view = section(
      data([
        recordAt(T1, {
          locales: [
            localeEntry("de", {
              translated: 4,
              cacheHits: 1,
              fuzzyHits: 1,
              generated: 2,
              pruned: 1,
              integrityMismatches: 1,
              providerFailures: 3,
            }),
          ],
        }),
      ]),
    );

    expect(view.get("tbody tr").textContent).toContain(
      "4 translated, 2 from memory, 2 generated, 1 pruned, 1 refused, 3 failed",
    );
  });

  it("falls back to the bare provider when a record carries no model", () => {
    const view = section(data([recordAt(T1, { model: undefined })]));

    expect(view.get("tbody tr").textContent).toContain("anthropic");
    expect(view.get("tbody tr").textContent).not.toContain("claude-sonnet");
  });
});

describe("RunHistorySection coverage", () => {
  it("shows the last known value per locale and marks a locale the latest run did not measure", () => {
    const view = section(
      data([
        recordAt(T2, {
          locales: [localeEntry("de", { coverage: { missing: 0, stale: 0, upToDate: 9 } })],
        }),
        recordAt(T1, {
          locales: [
            localeEntry("de", { coverage: { missing: 5, stale: 5, upToDate: 5 } }),
            localeEntry("fr", { coverage: { missing: 2, stale: 1, upToDate: 7 } }),
          ],
        }),
      ]),
    );
    const rows = view.all('[aria-label="Coverage after the last measured run"] tbody tr');

    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain("de");
    expect(rows[0]?.textContent).toContain("9");
    expect(rows[0]?.textContent).not.toContain("Not measured in this run");
    expect(rows[1]?.textContent).toContain("fr");
    expect(rows[1]?.textContent).toContain("Not measured in this run");
    expect(rows[1]?.textContent).toContain("Last known");
  });

  it("says nothing was measured when no record carries coverage", () => {
    const view = section(data([recordAt(T1, { coverageUnavailable: true })]));

    expect(view.text()).toContain("No coverage was measured in these runs.");
  });
});
