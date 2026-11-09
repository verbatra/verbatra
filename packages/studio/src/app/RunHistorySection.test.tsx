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
    expect(view.text()).not.toContain("No runs recorded yet");
    expect(view.query("table")).toBeNull();
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
    expect(unreadable.text()).toContain("It is left as it is");
    expect(unreadable.text()).not.toContain("No runs recorded yet");
    expect(large.text()).toContain("over 8 MiB");
    expect(large.text()).not.toContain("No runs recorded yet");
  });

  it("says the next recorded run replaces an oversized file, never that it is left as it is", () => {
    const large = section(data([], { unavailable: "too-large" }));

    expect(large.text()).toContain("The next recorded run replaces the file");
    expect(large.text()).not.toContain("left as it is");
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

  it.each([
    { pricing: "no-rate-on-file", basis: "usage", rateKey: "x" },
    { pricing: "rate-unit-mismatch", basis: "usage", rateKey: "x" },
    { pricing: "no-usage", basis: "usage", rateKey: "x" },
    { pricing: "not-billed", rateKey: "x" },
  ] as const)("never prints a free or zero amount for a $pricing run", (cost) => {
    const view = section(data([recordAt(T1, { cost })]));

    expect(view.get("table").textContent).not.toMatch(/\$|free|\b0\.0/);
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
    expect(cost?.querySelector("polyline")?.getAttribute("points")).toContain(",");
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
    expect(view.container.querySelector("circle.fill-background")).not.toBeNull();
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
    expect(view.all('[aria-label="Recorded runs"] tbody tr').length).toBe(INITIAL_RUN_ROWS);

    const more = view.getByText("button", "Show more runs");
    click(more);

    expect(view.all('[aria-label="Recorded runs"] tbody tr').length).toBe(INITIAL_RUN_ROWS + 5);
    expect(view.query("button")).toBeNull();
  });

  it("moves focus to the first new row on every reveal, including the last one that removes the button", () => {
    const records = Array.from({ length: INITIAL_RUN_ROWS * 2 + 5 }, (_, index) =>
      recordAt(new Date(Date.UTC(2026, 6, 1, 0, index)).toISOString()),
    );
    const view = section(data(records));
    const rowsOf = () => view.all('[aria-label="Recorded runs"] tbody tr');

    click(view.getByText("button", "Show more runs"));

    expect(rowsOf()).toHaveLength(INITIAL_RUN_ROWS * 2);
    expect(document.activeElement).toBe(rowsOf()[INITIAL_RUN_ROWS]);

    click(view.getByText("button", "Show more runs"));

    expect(rowsOf()).toHaveLength(INITIAL_RUN_ROWS * 2 + 5);
    expect(view.query("button")).toBeNull();
    expect(document.activeElement).toBe(rowsOf()[INITIAL_RUN_ROWS * 2]);
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
      "4 translated, 2 from memory, 2 generated, 1 pruned, 1 refused, 3 keys failed",
    );
  });

  it("says a single failed key in the singular", () => {
    const view = section(
      data([recordAt(T1, { locales: [localeEntry("de", { providerFailures: 1 })] })]),
    );

    expect(view.get("tbody tr").textContent).toContain("1 key failed");
  });

  it("shows failed and partial locales and omitted locales, so an all-failed run is not a bare zero", () => {
    const view = section(
      data([
        recordAt(T1, {
          localesOmitted: 3,
          locales: [
            localeEntry("de", { status: "failed" }),
            localeEntry("fr", { status: "failed" }),
            localeEntry("es", { status: "partial", translated: 2 }),
          ],
        }),
        recordAt(T2, {
          localesOmitted: 1,
          locales: [localeEntry("de", { status: "failed" })],
        }),
      ]),
    );
    const rows = view.all("tbody tr");

    expect(rows[0]?.textContent).toContain("2 translated, 1 locale partial, 3 locales not listed");
    expect(rows[1]?.textContent).toContain("0 translated, 1 locale not listed");
  });

  it("leads the result with a danger badge for failed locales and a warning badge for partial ones", () => {
    const view = section(
      data([
        recordAt(T2, { locales: [localeEntry("de", { status: "partial", translated: 2 })] }),
        recordAt(T1, {
          locales: [
            localeEntry("de", { status: "failed" }),
            localeEntry("fr", { status: "failed" }),
          ],
        }),
        recordAt(T3, { locales: [localeEntry("de", { translated: 1 })] }),
      ]),
    );
    const rows = view.all("tbody tr");

    expect(rows[0]?.querySelector('[data-tone="warning"]')?.textContent).toBe("1 locale partial");
    expect(rows[0]?.querySelector('[data-tone="danger"]')).toBeNull();
    expect(rows[1]?.querySelector('[data-tone="danger"]')?.textContent).toBe("2 locales failed");
    expect(rows[2]?.querySelector('[data-tone="danger"], [data-tone="warning"]')).toBeNull();
  });

  it("shows a priced amount as a plain figure and keeps tone for an estimate or a lower bound", () => {
    const view = section(
      data([
        recordAt(T3),
        recordAt(T2, { cost: { ...PRICED, basis: "source-characters" } as RunHistoryCost }),
        recordAt(T1, { cost: { ...PRICED, caveats: ["USAGE_PARTIAL"] } as RunHistoryCost }),
      ]),
    );
    const rows = view.all("tbody tr");

    expect(rows[0]?.querySelector("td:nth-child(4) [data-tone]")).toBeNull();
    expect(rows[0]?.querySelector("td:nth-child(4) .tabular-nums")?.textContent).toBe("$0.50");
    expect(rows[1]?.querySelector('td:nth-child(4) [data-tone="warning"]')?.textContent).toBe(
      "estimated $0.50",
    );
    expect(rows[2]?.querySelector('td:nth-child(4) [data-tone="warning"]')?.textContent).toBe(
      "at least $0.50",
    );
  });

  it("states the shared rate and lower-bound explanations once above the table and keeps a reason in each row", () => {
    const view = section(
      data([
        recordAt(T3, { cost: { ...PRICED, caveats: ["USAGE_PARTIAL"] } as RunHistoryCost }),
        recordAt(T2, { cost: { ...PRICED, basis: "source-characters" } as RunHistoryCost }),
        recordAt(T1),
      ]),
    );
    const notes = view.get("[data-run-history-cost-notes]");

    expect(notes.textContent).toContain("anthropic/claude-sonnet-5-5 as of 2026-01-01");
    expect(notes.textContent?.match(/anthropic\/claude-sonnet-5-5/g)).toHaveLength(1);
    expect(notes.textContent).toContain("At least: a locale sent keys and reported no tokens");
    expect(notes.textContent).toContain("Estimated: worked out from the source characters");
    const cells = view.all("tbody tr td:nth-child(4)");
    expect(cells[0]?.querySelector(".sr-only")?.textContent).toContain("lower bound");
    expect(cells[1]?.querySelector(".sr-only")?.textContent).toContain("Estimated from the source");
    expect(view.all("tbody .sr-only")).toHaveLength(3);
  });

  it("marks tokens as a lower bound for a run with no rate when the record carries the caveat", () => {
    const view = section(
      data([
        recordAt(T1, {
          cost: {
            pricing: "no-rate-on-file",
            basis: "usage",
            rateKey: "x",
            caveats: ["USAGE_PARTIAL"],
          },
        }),
      ]),
    );

    expect(view.get("tbody tr").textContent).toContain("at least 100 in / 50 out");
    expect(view.get("tbody tr").textContent).toContain("no rate");
  });

  it("shows the provider and model, and each locale, as left-to-right monospace values that break anywhere", () => {
    const view = section(
      data([
        recordAt(T1, {
          locales: [localeEntry("de", { coverage: { missing: 0, stale: 0, upToDate: 1 } })],
        }),
      ]),
    );
    const provider = view.get("tbody tr td:nth-child(2) [dir='ltr']");
    const locale = view.get(
      '[aria-label="Coverage after the last measured run"] tbody td[dir="ltr"]',
    );

    expect(provider.querySelector(".font-mono.break-all")?.textContent).toBe(
      "anthropic / claude-sonnet-5-5",
    );
    expect(locale.querySelector(".font-mono.break-all")?.textContent).toBe("de");
  });

  it("pins the When column so it stays in view when the table scrolls sideways", () => {
    const view = section(data([recordAt(T1)]));
    const head = view.get('[aria-label="Recorded runs"] thead th');
    const cell = view.get('[aria-label="Recorded runs"] tbody td');

    for (const element of [head, cell]) {
      expect(element.className).toContain("sticky");
      expect(element.className).toContain("start-0");
      expect(element.className).toMatch(/\bbg-/);
    }
    expect(head.textContent).toBe("When");
  });

  it("draws the first and last run dates under each chart and a stronger baseline", () => {
    const view = section(data([recordAt(T3), recordAt(T2), recordAt(T1)]));
    const figures = view.all("figure");

    for (const figure of figures) {
      const times = [...figure.querySelectorAll("p time")];
      expect(times.map((time) => time.getAttribute("datetime"))).toEqual([T1, T3]);
      expect(figure.querySelector("line.stroke-\\(--border-field\\)")).not.toBeNull();
    }
  });

  it("shows the no-bar note only when a run is missing a bar", () => {
    const missing = section(data([recordAt(T2, { usage: undefined }), recordAt(T1)]));
    const complete = section(data([recordAt(T2), recordAt(T1)]));

    expect(missing.text()).toContain("A run with no bar did not report tokens.");
    expect(complete.text()).not.toContain("did not report tokens");
  });

  it("names a one-run chart in the singular and gives one date label", () => {
    const view = section(data([recordAt(T1)]));
    const [cost] = view.all("svg");
    const titleId = cost?.getAttribute("aria-labelledby") ?? "";

    expect(view.get(`#${CSS.escape(titleId)}`).textContent).toBe(
      "Cost per run (USD), 1 of 1 run, oldest to newest",
    );
    expect(view.get("figure").querySelectorAll("p time")).toHaveLength(1);
  });

  it("keeps a minimum bar height so a hollow bar keeps its stroke and a tiny bar stays visible", () => {
    const view = section(
      data([
        recordAt(T3, {
          usage: { inputTokens: 1, outputTokens: 0 },
          cost: { ...PRICED, caveats: ["USAGE_PARTIAL"] } as RunHistoryCost,
        }),
        recordAt(T2, { usage: { inputTokens: 100000, outputTokens: 0 } }),
        recordAt(T1, { usage: undefined }),
      ]),
    );
    const [, tokens] = view.all("svg");
    const bars = [...(tokens?.querySelectorAll("rect") ?? [])];

    expect(bars).toHaveLength(2);
    expect(bars.every((bar) => Number(bar.getAttribute("height")) >= 4)).toBe(true);
    const tiny = tokens?.querySelector("rect.fill-background");
    expect(tiny?.getAttribute("height")).toBe("4");
    expect(tiny?.getAttribute("stroke-width")).toBe("2");
  });

  it("marks tokens and the token bar as a lower bound when the cost is a lower bound", () => {
    const view = section(
      data([
        recordAt(T1, { cost: { ...PRICED, caveats: ["USAGE_PARTIAL"] } as RunHistoryCost }),
        recordAt(T2),
      ]),
    );
    const rows = view.all("tbody tr");
    const [, tokens] = view.all("svg");

    expect(rows[0]?.textContent).toContain("at least 100 in / 50 out");
    expect(rows[1]?.textContent).not.toContain("at least 100");
    expect(tokens?.querySelectorAll("rect.fill-background")).toHaveLength(1);
    expect(tokens?.querySelectorAll("rect.fill-primary")).toHaveLength(1);
    expect(tokens?.querySelector("rect.fill-background")?.getAttribute("stroke-width")).toBe("2");
    expect(tokens?.querySelector("rect.fill-primary")?.getAttribute("stroke-width")).toBe("0");
    expect(tokens?.querySelector("rect.fill-background title")?.textContent).toContain(
      "at least 150",
    );
    expect(view.text()).toContain("A hollow bar is a lower bound.");
  });

  it("falls back to the bare provider when a record carries no model", () => {
    const view = section(data([recordAt(T1, { model: undefined })]));

    const provider = view.get("tbody tr td:nth-child(2)").textContent;
    expect(provider).toContain("anthropic");
    expect(provider).not.toContain("claude-sonnet");
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

  it("lists a locale that was never measured with no figures, never zeros, and marks it", () => {
    const view = section(data([recordAt(T1, { coverageUnavailable: true })]));
    const rows = view.all('[aria-label="Coverage after the last measured run"] tbody tr');

    expect(rows).toHaveLength(1);
    expect(rows[0]?.textContent).toContain("Coverage check failed in this run");
    expect(rows[0]?.textContent).not.toContain("Not measured in this run");
    expect(rows[0]?.textContent).not.toContain("Last known");
    expect(rows[0]?.textContent).not.toMatch(/\b0\b/);
  });

  it("keeps the last known value and says the check failed for a locale in a run whose coverage check failed", () => {
    const view = section(
      data([
        recordAt(T2, { coverageUnavailable: true }),
        recordAt(T1, {
          locales: [localeEntry("de", { coverage: { missing: 1, stale: 2, upToDate: 3 } })],
        }),
      ]),
    );
    const rows = view.all('[aria-label="Coverage after the last measured run"] tbody tr');

    expect(rows[0]?.textContent).toContain("Coverage check failed in this run");
    expect(rows[0]?.textContent).toContain("Last known");
  });

  it("says the coverage table reads the listed runs and leaves out a locale none of them names", () => {
    const view = section(data([recordAt(T2), recordAt(T1)]));
    const single = section(data([recordAt(T1)]));

    expect(view.text()).toContain("Read from the newest 2 recorded runs listed above.");
    expect(view.text()).toContain("A locale that no listed run names is left out.");
    expect(single.text()).toContain("Read from the newest 1 recorded run listed above.");
  });

  it("caps the coverage rows at ten, then reveals the rest and moves focus to the first revealed row", () => {
    const locales = Array.from({ length: 13 }, (_, index) =>
      localeEntry(`l${String(index).padStart(2, "0")}`, {
        coverage: { missing: 0, stale: 0, upToDate: 1 },
      }),
    );
    const view = section(data([recordAt(T1, { locales })]));
    const rowsOf = () => view.all('[aria-label="Coverage after the last measured run"] tbody tr');

    expect(rowsOf()).toHaveLength(10);
    click(view.getByText("button", "Show all 13 locales"));

    expect(rowsOf()).toHaveLength(13);
    expect(document.activeElement).toBe(rowsOf()[10]);
    expect(view.query("button")).toBeNull();
  });

  it("says nothing was measured when the records name no locale", () => {
    const view = section(data([recordAt(T1, { locales: [] })]));

    expect(view.text()).toContain("No coverage was measured in these runs.");
  });
});
