// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import type { DiffLocale } from "../../client/diff-view.js";
import { formatTimestamp } from "../../client/ui-format.js";
import type { HistoryCommit, HistoryListResult } from "../../shared/rpc/history.js";
import type { UsageSummaryResult } from "../../shared/rpc/usage-summary.js";
import type { RenderResult, StubRpcHandler, StubRpcResult } from "../test-support.js";
import {
  clickAsync,
  failedQueueView,
  flush,
  hasMetricCard,
  metricCard,
  metricFigure,
  metricHint,
  metricValue,
  render,
  renderAsync,
  reviewQueueView,
  rpcCalls,
  rpcError,
  stubRpc,
  unavailableQueueView,
} from "../test-support.js";
import { OverviewPanel } from "./OverviewPanel.js";

vi.mock("../api.js", () => import("../test-support.js").then((module) => module.apiMock()));

const GENERATED_AT = "2026-05-04T10:15:00.000Z";

const COMMITS: readonly HistoryCommit[] = [
  {
    hash: "0f3ab19c7d5e4a2b",
    author: "Ada Lovelace",
    authorDate: "2026-05-04T09:00:00.000Z",
    subject: "chore: sync the German locale file",
    touchedPaths: ["locales/de.json", "locales/fr.json"],
  },
  {
    hash: "9c1de77a0b3f5511",
    author: "Ada Lovelace",
    authorDate: "2026-05-02T08:30:00.000Z",
    subject: "feat: add the checkout keys",
    touchedPaths: [],
  },
];

const LOADED_HISTORY: HistoryListResult = { available: true, commits: COMMITS };

const TRACKED_RUN: UsageSummaryResult = {
  available: true,
  generatedAt: GENERATED_AT,
  usage: { inputTokens: 640, outputTokens: 128 },
  budget: { maxTokens: 800, behavior: "warn", supported: true, tokensUsed: 250, exceeded: false },
};

function historyAnswer(result: HistoryListResult): {
  readonly ok: true;
  readonly result: HistoryListResult;
} {
  return { ok: true, result };
}

function usageAnswer(result: UsageSummaryResult): {
  readonly ok: true;
  readonly result: UsageSummaryResult;
} {
  return { ok: true, result };
}

type Stubs = Readonly<Record<string, StubRpcResult | StubRpcHandler>>;

function stubOverview(overrides: Stubs = {}): void {
  stubRpc({
    "status.diff": diffResult(DEFAULT_LOCALES),
    "status.check": checkResult(DEFAULT_ROWS),
    "lock.state": NO_LOCK,
    "usage.summary": NO_USAGE,
    "history.list": historyAnswer(LOADED_HISTORY),
    ...overrides,
  });
}

function stubActivity(
  usage: UsageSummaryResult,
  history: HistoryListResult = LOADED_HISTORY,
): void {
  stubOverview({ "usage.summary": usageAnswer(usage), "history.list": historyAnswer(history) });
}

function stubPage(overrides: Stubs = {}): void {
  stubOverview(overrides);
}

function stubSyncedPage(overrides: Stubs = {}): void {
  stubOverview({
    "status.diff": diffResult(IN_SYNC_LOCALES),
    "status.check": checkResult(IN_SYNC_ROWS),
    ...overrides,
  });
}

function copyOf(alert: HTMLElement): string {
  const clone = alert.cloneNode(true) as HTMLElement;
  clone.querySelector("[data-error-actions]")?.remove();
  return clone.textContent?.trim() ?? "";
}

function alertText(view: RenderResult): string {
  return copyOf(view.get('[role="alert"]'));
}

interface KeyLists {
  readonly missing?: readonly string[];
  readonly changed?: readonly string[];
  readonly orphaned?: readonly string[];
  readonly protected?: readonly string[];
}

function localeDiff(locale: string, lists: KeyLists = {}): DiffLocale {
  const missing = lists.missing ?? [];
  const changed = lists.changed ?? [];
  const orphaned = lists.orphaned ?? [];
  return {
    locale,
    missing,
    changed,
    orphaned,
    hasPendingChanges: missing.length > 0 || changed.length > 0,
    ...(lists.protected !== undefined ? { protected: lists.protected } : {}),
  };
}

function diffResult(locales: readonly DiffLocale[]): StubRpcResult {
  return {
    ok: true,
    result: { hasPendingChanges: locales.some((locale) => locale.hasPendingChanges), locales },
  };
}

interface CoverageCounts {
  readonly locale: string;
  readonly missing: number;
  readonly stale: number;
  readonly upToDate: number;
}

function checkResult(rows: readonly CoverageCounts[]): StubRpcResult {
  const locales = rows.map((row) => ({ ...row, inSync: row.missing === 0 && row.stale === 0 }));
  return { ok: true, result: { inSync: locales.every((locale) => locale.inSync), locales } };
}

interface LockCounts extends CoverageCounts {
  readonly keyCount: number;
}

function lockResult(version: number, locales: readonly LockCounts[]): StubRpcResult {
  return { ok: true, result: { exists: true, version, locales } };
}

const NO_LOCK: StubRpcResult = { ok: true, result: { exists: false } };
const NO_USAGE: StubRpcResult = { ok: true, result: { available: false } };

const PENDING: StubRpcHandler = () => new Promise<StubRpcResult>(() => {});

const DEFAULT_LOCALES: readonly DiffLocale[] = [
  localeDiff("de", { missing: ["app.title"], changed: ["app.body"] }),
  localeDiff("fr", { missing: ["app.title"] }),
];

const DEFAULT_ROWS: readonly CoverageCounts[] = [
  { locale: "de", missing: 1, stale: 1, upToDate: 8 },
  { locale: "fr", missing: 1, stale: 0, upToDate: 9 },
];

const IN_SYNC_LOCALES: readonly DiffLocale[] = [localeDiff("de"), localeDiff("fr")];

const IN_SYNC_ROWS: readonly CoverageCounts[] = [
  { locale: "de", missing: 0, stale: 0, upToDate: 10 },
  { locale: "fr", missing: 0, stale: 0, upToDate: 10 },
];

function answersInOrder(results: readonly [StubRpcResult, ...StubRpcResult[]]): StubRpcHandler {
  let index = 0;
  return () => {
    const answer = results[Math.min(index, results.length - 1)] ?? results[0];
    index += 1;
    return answer;
  };
}

function deferredAnswers(): {
  readonly handler: StubRpcHandler;
  answer(call: number, result: StubRpcResult): void;
} {
  const resolvers: Array<(result: StubRpcResult) => void> = [];
  return {
    handler: () =>
      new Promise<StubRpcResult>((resolve) => {
        resolvers.push(resolve);
      }),
    answer(call: number, result: StubRpcResult): void {
      const resolve = resolvers[call];
      if (resolve === undefined) {
        throw new Error(`call ${call} was never made`);
      }
      resolve(result);
    },
  };
}

function localesSection(view: RenderResult): HTMLElement {
  const section = view.getByText("h2", "Locales").closest("section");
  if (section === null) {
    throw new Error("the Locales heading is not inside a section");
  }
  return section;
}

function coverageRows(view: RenderResult): HTMLElement[] {
  const table = localesSection(view).querySelector('[aria-label="Locale coverage"] table') ?? null;
  if (table === null) {
    throw new Error("the Locales section rendered no coverage table");
  }
  return [...table.querySelectorAll<HTMLElement>("tbody tr")];
}

function commitRows(view: RenderResult): HTMLElement[] {
  return view.all('ul[aria-label="Commits"] > li');
}

function cellTexts(row: HTMLElement | undefined): string[] {
  if (row === undefined) {
    throw new Error("the expected table row is missing");
  }
  return [...row.querySelectorAll("td")].map((cell) => cell.textContent ?? "");
}

function alertTexts(view: RenderResult): string[] {
  return view.all('[role="alert"]').map((alert) => copyOf(alert));
}

function metricTile(
  view: RenderResult,
  label: string,
): { readonly value: string; readonly hint: string; readonly meterWidth: string | null } {
  const meter = metricCard(view, label).querySelector<HTMLElement>("[data-tone]");
  return {
    value: metricValue(view, label),
    hint: metricHint(view, label) ?? "",
    meterWidth: meter === null ? null : meter.style.width,
  };
}

const ONCE_EACH = {
  "history.list": 1,
  "lock.state": 1,
  "status.check": 1,
  "status.diff": 1,
  "usage.summary": 1,
};

const TWICE_EACH = {
  "history.list": 2,
  "lock.state": 2,
  "status.check": 2,
  "status.diff": 2,
  "usage.summary": 2,
};

function callCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const call of rpcCalls) {
    counts[call.method] = (counts[call.method] ?? 0) + 1;
  }
  return counts;
}

describe("OverviewPanel", () => {
  it("names the page in its header", async () => {
    stubActivity(TRACKED_RUN);

    const view = await renderAsync(<OverviewPanel refreshToken={0} />);

    expect(view.get("h1").textContent).toBe("Overview");
  });

  it("shows both panes as loading while the two reads are still open", () => {
    stubOverview({
      "status.diff": diffResult(DEFAULT_LOCALES),
      "status.check": checkResult(DEFAULT_ROWS),
      "lock.state": NO_LOCK,
      "usage.summary": () => new Promise(() => {}),
      "history.list": () => new Promise(() => {}),
    });

    const view = render(<OverviewPanel refreshToken={0} />);

    expect(
      view.all('[role="status"]').filter((node) => node.textContent?.trim() === "Loading..."),
    ).toHaveLength(2);
  });

  it("reads every source once, with no parameters, so the last run is read a single time", async () => {
    stubActivity(TRACKED_RUN);

    await renderAsync(<OverviewPanel refreshToken={0} />);

    expect(callCounts()).toEqual(ONCE_EACH);
  });

  it("re-reads every source when the refresh token changes", async () => {
    stubActivity(TRACKED_RUN);

    const view = await renderAsync(<OverviewPanel refreshToken={0} />);
    view.rerender(<OverviewPanel refreshToken={1} />);
    await flush();

    expect(callCounts()).toEqual(TWICE_EACH);
  });

  it("renders one feed row per commit, with the short hash and calendar date", async () => {
    stubActivity(TRACKED_RUN);

    const view = await renderAsync(<OverviewPanel refreshToken={0} />);
    const rows = commitRows(view);

    expect(rows).toHaveLength(2);
    expect(view.text()).toContain("chore: sync the German locale file");
    expect(view.text()).toContain("0f3ab19");
    expect(view.text()).toContain(formatTimestamp(COMMITS[0]?.authorDate ?? ""));
  });

  it("lists the files a commit touched, and omits the list for a commit with none", async () => {
    stubActivity(TRACKED_RUN);

    const view = await renderAsync(<OverviewPanel refreshToken={0} />);
    const lists = view.all('ul[aria-label="Files changed"]');

    expect(lists).toHaveLength(1);
    expect(lists[0]?.textContent).toBe("locales/de.jsonlocales/fr.json");
  });

  it("renders the run's token totals as two tiles", async () => {
    stubActivity(TRACKED_RUN);

    const view = await renderAsync(<OverviewPanel refreshToken={0} />);

    expect(metricValue(view, "Input tokens")).toBe("640");
    expect(metricValue(view, "Output tokens")).toBe("128");
  });

  it("stamps the rail with the run's own timestamp, so it never reads as a live counter", async () => {
    stubActivity(TRACKED_RUN);

    const view = await renderAsync(<OverviewPanel refreshToken={0} />);

    expect(view.text()).toContain(`As of ${formatTimestamp(GENERATED_AT)}`);
  });

  it("says tokens were not reported rather than showing a fabricated zero", async () => {
    stubActivity({ available: true, generatedAt: GENERATED_AT });

    const view = await renderAsync(<OverviewPanel refreshToken={0} />);

    expect(metricValue(view, "Tokens")).toBe("Not reported");
    expect(metricHint(view, "Tokens")).toBe(
      "No token usage was recorded: the run called no provider, or its provider does not report usage.",
    );
    expect(hasMetricCard(view, "Input tokens")).toBe(false);
    expect(hasMetricCard(view, "Output tokens")).toBe(false);
  });

  it("renders a tracked budget as a meter plus a within-budget badge", async () => {
    stubActivity(TRACKED_RUN);

    const view = await renderAsync(<OverviewPanel refreshToken={0} />);
    const meter = metricCard(view, "Budget").querySelector<HTMLElement>("[data-tone]");

    expect(metricValue(view, "Budget")).toBe("250 / 800");
    expect(metricHint(view, "Budget")).toBe("Behavior: warn");
    expect(meter?.style.width).toBe("31%");
    expect(meter?.dataset.tone).toBe("primary");
    expect(metricCard(view, "Budget status").textContent).toContain("Within budget");
  });

  it("tones the meter and the badge off the run's own exceeded flag", async () => {
    stubActivity({
      available: true,
      generatedAt: GENERATED_AT,
      usage: { inputTokens: 900, outputTokens: 0 },
      budget: {
        maxTokens: 800,
        behavior: "stop",
        supported: true,
        tokensUsed: 900,
        exceeded: true,
      },
    });

    const view = await renderAsync(<OverviewPanel refreshToken={0} />);
    const meter = metricCard(view, "Budget").querySelector<HTMLElement>("[data-tone]");

    expect(meter?.style.width).toBe("100%");
    expect(meter?.dataset.tone).toBe("danger");
    expect(metricCard(view, "Budget status").textContent).toContain("Ceiling reached");
  });

  it("shows the stopped state for an estimated budget, not an untracked placeholder", async () => {
    stubActivity({
      available: true,
      generatedAt: GENERATED_AT,
      budget: {
        maxTokens: 800,
        behavior: "stop",
        supported: false,
        tokensUsed: 794,
        exceeded: true,
      },
    });

    const view = await renderAsync(<OverviewPanel refreshToken={0} />);

    expect(metricValue(view, "Budget")).toBe("794 / 800");
    expect(metricHint(view, "Budget")).toContain("estimated");
    expect(metricCard(view, "Budget status").textContent).toContain("Stopped before the ceiling");
    expect(view.text()).not.toContain("Not tracked for this provider.");
  });

  it("shows a stop run refused under its ceiling as stopped short, not as an overflow", async () => {
    stubActivity({
      available: true,
      generatedAt: GENERATED_AT,
      budget: {
        maxTokens: 10000,
        behavior: "stop",
        supported: true,
        tokensUsed: 6000,
        exceeded: true,
      },
    });

    const view = await renderAsync(<OverviewPanel refreshToken={0} />);
    const meter = metricCard(view, "Budget").querySelector<HTMLElement>("[data-tone]");
    const status = metricCard(view, "Budget status");

    expect(meter?.style.width).toBe("60%");
    expect(meter?.dataset.tone).toBe("primary");
    expect(status.textContent).toContain("Stopped before the ceiling");
    expect(status.textContent).not.toContain("Ceiling reached");
    expect(status.querySelector("[data-tone=warning]")).not.toBeNull();
  });

  it("does not call the budget estimated when the run counted nothing at all", async () => {
    stubActivity({
      available: true,
      generatedAt: GENERATED_AT,
      budget: {
        maxTokens: 800,
        behavior: "warn",
        supported: false,
        tokensUsed: 0,
        exceeded: false,
      },
    });

    const view = await renderAsync(<OverviewPanel refreshToken={0} />);

    expect(metricValue(view, "Budget")).toBe("0 / 800");
    expect(metricHint(view, "Budget")).toBe("Behavior: warn");
    expect(metricCard(view, "Budget status").textContent).toContain("Within budget");
  });

  it("labels a provider-reported budget by its behavior alone, with no estimated marker", async () => {
    stubActivity({
      available: true,
      generatedAt: GENERATED_AT,
      budget: {
        maxTokens: 800,
        behavior: "stop",
        supported: true,
        tokensUsed: 120,
        exceeded: false,
      },
    });

    const view = await renderAsync(<OverviewPanel refreshToken={0} />);

    expect(metricHint(view, "Budget")).toBe("Behavior: stop");
  });

  it("renders no budget tile at all when the run had no budget configured", async () => {
    stubActivity({
      available: true,
      generatedAt: GENERATED_AT,
      usage: { inputTokens: 640, outputTokens: 128 },
    });

    const view = await renderAsync(<OverviewPanel refreshToken={0} />);

    expect(view.text()).not.toContain("Budget");
    expect(metricValue(view, "Input tokens")).toBe("640");
  });

  it("invites a first run when no usage snapshot has been recorded", async () => {
    stubActivity({ available: false });

    const view = await renderAsync(<OverviewPanel refreshToken={0} />);

    expect(view.text()).toContain("No run recorded yet");
    expect(view.text()).toContain("to record one.");
    expect(view.query('[role="alert"]')).toBeNull();
  });

  it("renders a first usage read that fails as a hard error, with no rail data", async () => {
    stubOverview({
      "usage.summary": rpcError("SNAPSHOT_UNREADABLE", "the run snapshot could not be read"),
      "history.list": historyAnswer(LOADED_HISTORY),
    });

    const view = await renderAsync(<OverviewPanel refreshToken={0} />);

    expect(alertText(view)).toBe("the run snapshot could not be read");
    expect(view.text()).not.toContain("Input tokens");
  });

  it("keeps the last good usage data, marked stale, when a re-fetch fails", async () => {
    let attempts = 0;
    stubOverview({
      "history.list": historyAnswer(LOADED_HISTORY),
      "usage.summary": () => {
        attempts += 1;
        return attempts === 1
          ? usageAnswer(TRACKED_RUN)
          : rpcError("SNAPSHOT_UNREADABLE", "the run snapshot could not be read");
      },
    });

    const view = await renderAsync(<OverviewPanel refreshToken={0} />);
    view.rerender(<OverviewPanel refreshToken={1} />);
    await flush();

    expect(alertText(view)).toBe(
      "Showing the last known usage. the run snapshot could not be read",
    );
    expect(metricValue(view, "Input tokens")).toBe("640");
  });

  it("renders history as unavailable, not an error, for a project without git", async () => {
    stubActivity(TRACKED_RUN, { available: false, reason: "not-a-repository" });

    const view = await renderAsync(<OverviewPanel refreshToken={0} />);

    expect(view.text()).toContain("History unavailable");
    expect(view.text()).toContain("This project is not a git repository, or git is not installed.");
    expect(view.query('[role="alert"]')).toBeNull();
  });

  it("explains an empty commit feed with the panel's own message", async () => {
    stubActivity(TRACKED_RUN, { available: true, commits: [] });

    const view = await renderAsync(<OverviewPanel refreshToken={0} />);

    expect(view.text()).toContain("No commits yet");
    expect(view.text()).toContain("No commit history yet for the source or target locale files.");
  });

  it("renders a failed history read as an error beside a healthy rail", async () => {
    stubOverview({
      "usage.summary": usageAnswer(TRACKED_RUN),
      "history.list": rpcError("INTERNAL"),
    });

    const view = await renderAsync(<OverviewPanel refreshToken={0} />);

    expect(alertText(view)).toBe(
      "An unexpected server error occurred. Check the terminal running Studio for details.",
    );
    expect(metricValue(view, "Input tokens")).toBe("640");
  });

  it("ignores answers that arrive after the panel unmounted", async () => {
    let answer: (() => void) | undefined;
    stubOverview({
      "history.list": historyAnswer(LOADED_HISTORY),
      "usage.summary": () =>
        new Promise((resolve) => {
          answer = () => {
            resolve(usageAnswer(TRACKED_RUN));
          };
        }),
    });

    const view = render(<OverviewPanel refreshToken={0} />);
    view.unmount();
    answer?.();
    await flush();

    expect(view.container.textContent).toBe("");
  });

  it("re-reads the lock state on every refresh token change", async () => {
    stubPage();
    const view = await renderAsync(<OverviewPanel refreshToken={1} />);

    view.rerender(<OverviewPanel refreshToken={2} />);
    await flush();

    expect(rpcCalls.filter((call) => call.method === "lock.state")).toHaveLength(2);
  });

  it("ignores a lock response that a later refresh already superseded", async () => {
    const lock = deferredAnswers();
    stubSyncedPage({ "lock.state": lock.handler });
    const view = await renderAsync(<OverviewPanel refreshToken={1} />);
    view.rerender(<OverviewPanel refreshToken={2} />);

    lock.answer(1, lockResult(9, []));
    await flush();
    lock.answer(0, lockResult(1, []));
    await flush();

    expect(view.getByText("span", "Lock v9")).not.toBeNull();
    expect(view.all("span").map((node) => node.textContent)).not.toContain("Lock v1");
  });
});

describe("OverviewPanel metrics", () => {
  it("withholds an attention figure while the diff is still loading", () => {
    stubPage({ "status.diff": PENDING });

    const view = render(<OverviewPanel refreshToken={1} />);

    expect(metricTile(view, "Needs attention")).toMatchObject({
      value: "…",
      hint: "Checking pending changes.",
    });
  });

  it("marks the attention figure unavailable when the diff read failed", async () => {
    stubPage({ "status.diff": rpcError("INTERNAL", "gone") });

    const view = await renderAsync(<OverviewPanel refreshToken={1} />);

    expect(metricTile(view, "Needs attention")).toMatchObject({
      value: "N/A",
      hint: "The pending-change check failed.",
    });
    expect(alertTexts(view)).toContain(
      "An unexpected server error occurred. Check the terminal running Studio for details.",
    );
  });

  it("reads zero keys needing attention when every locale is in sync", async () => {
    stubSyncedPage();

    const view = await renderAsync(<OverviewPanel refreshToken={1} />);

    expect(metricTile(view, "Needs attention")).toMatchObject({
      value: "0",
      hint: "Everything is in sync.",
    });
  });

  it("counts the distinct drift keys across every locale", async () => {
    stubPage();

    const view = await renderAsync(<OverviewPanel refreshToken={1} />);

    expect(metricTile(view, "Needs attention")).toMatchObject({
      value: "2",
      hint: "2 keys are missing, changed or orphaned (3 entries across 2 of 2 target locales).",
    });
  });

  it("says locale rather than locales for a single-locale project", async () => {
    stubPage({
      "status.diff": diffResult([localeDiff("de", { missing: ["app.title"] })]),
      "status.check": checkResult([{ locale: "de", missing: 1, stale: 0, upToDate: 9 }]),
    });

    const view = await renderAsync(<OverviewPanel refreshToken={1} />);

    expect(metricTile(view, "Needs attention").hint).toBe(
      "1 key is missing, changed or orphaned (1 entry across 1 of 1 target locale).",
    );
    expect(metricTile(view, "Avg coverage").hint).toBe("Across 1 target locale.");
  });

  it("states the attention hint without waiting for the coverage read", async () => {
    stubPage({ "status.check": PENDING });

    const view = await renderAsync(<OverviewPanel refreshToken={1} />);

    expect(metricTile(view, "Needs attention").hint).toBe(
      "2 keys are missing, changed or orphaned (3 entries across 2 of 2 target locales).",
    );
  });

  it("withholds the coverage figure and its meter while the coverage read is open", async () => {
    stubSyncedPage({ "status.check": PENDING });

    const view = await renderAsync(<OverviewPanel refreshToken={1} />);

    expect(metricTile(view, "Avg coverage")).toEqual({
      value: "…",
      hint: "Loading locale coverage.",
      meterWidth: null,
    });
  });

  it("meters the mean coverage once the rows are in", async () => {
    stubPage();

    const view = await renderAsync(<OverviewPanel refreshToken={1} />);

    expect(metricTile(view, "Avg coverage")).toEqual({
      value: "85%",
      hint: "Across 2 target locales.",
      meterWidth: "85%",
    });
  });

  it("withholds the in-sync tally while the coverage read is open", async () => {
    stubSyncedPage({ "status.check": PENDING });

    const view = await renderAsync(<OverviewPanel refreshToken={1} />);

    expect(metricTile(view, "Locales in sync")).toMatchObject({
      value: "…",
      hint: "Loading sync state.",
    });
  });

  it("tallies how many locales are in sync when some are behind", async () => {
    stubPage();

    const view = await renderAsync(<OverviewPanel refreshToken={1} />);

    expect(metricTile(view, "Locales in sync")).toMatchObject({
      value: "0 / 2",
      hint: "At least one locale is out of sync.",
    });
  });

  it("tallies every locale as in sync when none is behind", async () => {
    stubSyncedPage();

    const view = await renderAsync(<OverviewPanel refreshToken={1} />);

    expect(metricTile(view, "Locales in sync")).toMatchObject({
      value: "2 / 2",
      hint: "All target locales are in sync.",
    });
  });

  it("reads a project with no target locales as fully covered", async () => {
    stubPage({ "status.diff": diffResult([]), "status.check": checkResult([]) });

    const view = await renderAsync(<OverviewPanel refreshToken={1} />);

    expect(metricTile(view, "Avg coverage")).toMatchObject({
      value: "100%",
      hint: "Across 0 target locales.",
    });
  });
});

describe("OverviewPanel locales section", () => {
  it("announces the coverage table while the status read is open", async () => {
    stubSyncedPage({ "status.check": PENDING });

    const view = await renderAsync(<OverviewPanel refreshToken={1} />);

    const section = view.getByText("h2", "Locales").closest("section");

    expect(section?.querySelector('[role="status"]')?.textContent).toBe("Loading locale coverage…");
  });

  it("reports a failed status read in place of the coverage table", async () => {
    stubSyncedPage({ "status.check": rpcError("SOURCE_UNREADABLE", "no source file") });

    const view = await renderAsync(<OverviewPanel refreshToken={1} />);

    expect(alertTexts(view)).toEqual([
      "The source locale file could not be found on disk. no source file",
    ]);
  });

  it("keeps the last known coverage rows when a status re-read fails", async () => {
    stubSyncedPage({
      "status.check": answersInOrder([
        checkResult(IN_SYNC_ROWS),
        rpcError("METHOD_RATE_LIMITED", "slow down"),
      ]),
    });
    const view = await renderAsync(<OverviewPanel refreshToken={1} />);

    view.rerender(<OverviewPanel refreshToken={2} />);
    await flush();

    expect(alertTexts(view)).toEqual([
      "Showing the last known coverage. Studio is limiting how often this action can run. Wait a moment and try again.",
    ]);
    expect(coverageRows(view)).toHaveLength(2);
  });

  it("renders one coverage row per locale, with its percentage and key counts", async () => {
    stubPage();

    const view = await renderAsync(<OverviewPanel refreshToken={1} />);

    expect(cellTexts(coverageRows(view)[0])).toEqual([
      "de",
      "80%8 / 10 keys",
      "1",
      "1",
      "8",
      "Translations for deReview for de",
    ]);
  });

  it("names the lock version next to the section heading", async () => {
    stubSyncedPage({ "lock.state": lockResult(3, []) });

    const view = await renderAsync(<OverviewPanel refreshToken={1} />);

    expect(view.getByText("span", "Lock v3")).not.toBeNull();
  });

  it("labels each locale's recorded lock entry against the current files", async () => {
    stubSyncedPage({
      "status.check": checkResult([
        { locale: "de", missing: 0, stale: 0, upToDate: 10 },
        { locale: "fr", missing: 0, stale: 0, upToDate: 10 },
        { locale: "es", missing: 0, stale: 0, upToDate: 10 },
        { locale: "it", missing: 0, stale: 0, upToDate: 10 },
      ]),
      "lock.state": lockResult(3, [
        { locale: "de", keyCount: 10, missing: 2, stale: 0, upToDate: 8 },
        { locale: "fr", keyCount: 10, missing: 0, stale: 3, upToDate: 7 },
        { locale: "es", keyCount: 10, missing: 0, stale: 0, upToDate: 10 },
      ]),
    });

    const view = await renderAsync(<OverviewPanel refreshToken={1} />);

    expect(coverageRows(view).map((row) => cellTexts(row)[5])).toEqual([
      "Drift",
      "In step",
      "Drift",
      "Not recorded",
    ]);
  });

  it("tabulates the lock file's own per-locale counts behind the detail disclosure", async () => {
    stubSyncedPage({
      "lock.state": lockResult(3, [
        { locale: "de", keyCount: 10, missing: 2, stale: 1, upToDate: 7 },
      ]),
    });
    const view = await renderAsync(<OverviewPanel refreshToken={1} />);

    const detail = view.get("details");

    expect(cellTexts(detail.querySelector<HTMLElement>("tbody tr") ?? undefined)).toEqual([
      "de",
      "10",
      "2",
      "1",
      "7",
      "Unavailable",
    ]);
  });

  it("summarizes who wrote each locale's current values in the lock file details", async () => {
    const byOrigin = {
      machine: 6,
      memory: 0,
      fuzzy: 0,
      agent: 1,
      human: 2,
      import: 0,
      unknown: 0,
      unrecorded: 0,
      external: 1,
    };
    stubSyncedPage({
      "lock.state": {
        ok: true,
        result: {
          exists: true,
          version: 1,
          locales: [
            {
              locale: "de",
              keyCount: 10,
              missing: 0,
              stale: 0,
              upToDate: 10,
              provenance: {
                byOrigin,
                byReviewState: { unreviewed: 10, approved: 0, rejected: 0 },
              },
            },
          ],
        },
      },
    });
    const view = await renderAsync(<OverviewPanel refreshToken={1} />);

    const detail = view.get("details");

    const items = [...(detail?.querySelectorAll("tbody tr td:last-child li") ?? [])];
    expect(items.map((item) => item.textContent)).toEqual([
      "6 machine",
      "1 agent",
      "2 human",
      "1 edited outside verbatra",
    ]);
    expect(items.every((item) => item.className.includes("whitespace-nowrap"))).toBe(true);
  });

  it("explains the missing lock file instead of showing a lock column", async () => {
    stubSyncedPage();

    const view = await renderAsync(<OverviewPanel refreshToken={1} />);

    expect(view.text()).toContain("No lock file yet.");
    expect(view.all("th").map((cell) => cell.textContent)).not.toContain("Lock");
  });

  it("reports a failed lock read under the coverage table", async () => {
    stubSyncedPage({ "lock.state": rpcError("LOCK_FILE_INVALID", "corrupt") });

    const view = await renderAsync(<OverviewPanel refreshToken={1} />);

    expect(alertTexts(view)).toEqual([
      "The lock file is missing, corrupt, or at an unsupported version. corrupt",
    ]);
  });
});

describe("OverviewPanel attention link, notices, history paging and order", () => {
  it("links the attention hint to the translations list filtered to missing, changed and orphaned keys", async () => {
    stubPage();

    const view = await renderAsync(<OverviewPanel refreshToken={1} />);

    expect(
      view.get('a[href="#/translations?status=missing&status=changed&status=orphaned"]')
        .textContent,
    ).toContain("missing, changed or orphaned");
  });

  it("counts a locale whose only drift is orphaned keys, with a link that lists them", async () => {
    stubPage({
      "status.diff": diffResult([localeDiff("de", { orphaned: ["app.legacy"] }), localeDiff("fr")]),
    });

    const view = await renderAsync(<OverviewPanel refreshToken={1} />);

    expect(metricTile(view, "Needs attention")).toMatchObject({
      value: "1",
      hint: "1 key is missing, changed or orphaned (1 entry across 1 of 2 target locales).",
    });
    expect(view.query('a[href*="status=orphaned"]')).not.toBeNull();
  });

  it("offers no attention link when everything is in sync", async () => {
    stubSyncedPage();

    const view = await renderAsync(<OverviewPanel refreshToken={1} />);

    expect(metricCard(view, "Needs attention").querySelector("a")).toBeNull();
  });

  it("keeps the last known pending changes and says so when a diff re-read fails", async () => {
    stubPage({
      "status.diff": answersInOrder([diffResult(DEFAULT_LOCALES), rpcError("INTERNAL", "gone")]),
    });
    const view = await renderAsync(<OverviewPanel refreshToken={1} />);

    view.rerender(<OverviewPanel refreshToken={2} />);
    await flush();

    expect(alertTexts(view)).toEqual([
      "Showing the last known pending changes. An unexpected server error occurred. Check the terminal running Studio for details.",
    ]);
  });

  function commitsOf(count: number): HistoryListResult {
    return {
      available: true,
      commits: Array.from({ length: count }, (_, index) => ({
        hash: `${String(index).padStart(2, "0")}f3ab19c7d5e4a2b`,
        author: "Ada Lovelace",
        authorDate: "2026-05-04T09:00:00.000Z",
        subject: `commit ${index}`,
        touchedPaths: [],
      })),
    };
  }

  function stubHistoryByLimit(available: number): void {
    stubOverview({
      "history.list": (params: unknown) => {
        const asked = (params as { limit?: number }).limit ?? 50;
        return historyAnswer(commitsOf(Math.min(asked, available)));
      },
    });
  }

  function feedRows(view: RenderResult): number {
    return commitRows(view).length;
  }

  it("asks for ten commits first and renders twenty after Show more", async () => {
    stubHistoryByLimit(60);
    const view = await renderAsync(<OverviewPanel refreshToken={1} />);

    expect(rpcCalls).toContainEqual({ method: "history.list", params: { limit: 10 } });
    expect(feedRows(view)).toBe(10);

    await clickAsync(view.getByText("button", "Show more commits"));
    await flush();

    expect(rpcCalls).toContainEqual({ method: "history.list", params: { limit: 20 } });
    expect(feedRows(view)).toBe(20);
  });

  it("keeps the expanded limit when the page refreshes", async () => {
    stubHistoryByLimit(60);
    const view = await renderAsync(<OverviewPanel refreshToken={1} />);
    await clickAsync(view.getByText("button", "Show more commits"));
    await flush();

    view.rerender(<OverviewPanel refreshToken={2} />);
    await flush();

    expect(rpcCalls.filter((call) => call.method === "history.list").at(-1)).toEqual({
      method: "history.list",
      params: { limit: 20 },
    });
    expect(feedRows(view)).toBe(20);
  });

  it("removes the button once a request returns fewer commits than asked for", async () => {
    stubHistoryByLimit(14);
    const view = await renderAsync(<OverviewPanel refreshToken={1} />);
    await clickAsync(view.getByText("button", "Show more commits"));
    await flush();

    expect(feedRows(view)).toBe(14);
    expect(view.query("button")).toBeNull();
  });

  it("moves focus to the first new commit after Show more", async () => {
    stubHistoryByLimit(60);
    const view = await renderAsync(<OverviewPanel refreshToken={1} />);
    await clickAsync(view.getByText("button", "Show more commits"));
    await flush();

    expect(document.activeElement).toBe(commitRows(view)[10]);
  });

  it("moves focus to the first new commit when the last page removes the button", async () => {
    stubHistoryByLimit(14);
    const view = await renderAsync(<OverviewPanel refreshToken={1} />);
    await clickAsync(view.getByText("button", "Show more commits"));
    await flush();

    expect(view.query("button")).toBeNull();
    expect(document.activeElement).toBe(commitRows(view)[10]);
  });

  it("leaves no large outline-free focus region around the history", async () => {
    stubHistoryByLimit(14);
    const view = await renderAsync(<OverviewPanel refreshToken={1} />);

    const focusable = view.all("[tabindex='-1']");

    expect(
      focusable.every(
        (node) => node.tagName === "LI" || node.hasAttribute("data-overview-recovery"),
      ),
    ).toBe(true);
    expect(view.query("[tabindex='-1'].outline-none")).toBeNull();
  });

  it("keeps the shown commits and offers Retry when asking for more fails", async () => {
    let calls = 0;
    stubOverview({
      "history.list": (params: unknown) => {
        calls += 1;
        const asked = (params as { limit?: number }).limit ?? 50;
        return calls === 1 ? historyAnswer(commitsOf(asked)) : rpcError("INTERNAL");
      },
    });
    const view = await renderAsync(<OverviewPanel refreshToken={1} />);
    await clickAsync(view.getByText("button", "Show more commits"));
    await flush();

    expect(commitRows(view)).toHaveLength(10);
    expect(view.text()).toContain("Showing the last known history.");
    expect(view.query("button[aria-disabled='true']")).toBeNull();
    expect(view.all("button").map((button) => button.textContent)).not.toContain(
      "Show more commits",
    );
  });

  it("removes the button at the sdk cap even though a full page came back", async () => {
    stubHistoryByLimit(1000);
    const view = await renderAsync(<OverviewPanel refreshToken={1} />);
    for (let step = 0; step < 19; step += 1) {
      await clickAsync(view.getByText("button", "Show more commits"));
      await flush();
    }

    expect(rpcCalls).toContainEqual({ method: "history.list", params: { limit: 200 } });
    expect(feedRows(view)).toBe(200);
    expect(view.query("button")).toBeNull();
  });

  it("offers no show-more control when fewer commits than asked for came back", async () => {
    stubActivity(TRACKED_RUN);

    const view = await renderAsync(<OverviewPanel refreshToken={1} />);

    expect(view.query("button")).toBeNull();
  });

  it("places the last run before the file history in document order", async () => {
    stubActivity(TRACKED_RUN);

    const view = await renderAsync(<OverviewPanel refreshToken={1} />);
    const titles = view.all("h2").map((heading) => heading.textContent);

    expect(titles.indexOf("Last run")).toBeGreaterThan(-1);
    expect(titles.indexOf("Last run")).toBeLessThan(titles.indexOf("Locale file history"));
  });

  it("hints that the coverage table scrolls sideways on narrow screens", async () => {
    stubPage();

    const view = await renderAsync(<OverviewPanel refreshToken={1} />);

    expect(view.text()).toContain("Scroll sideways to see every column.");
  });

  it("orders the page as metrics, then locales, then the last run and the file history", async () => {
    stubActivity(TRACKED_RUN);

    const view = await renderAsync(<OverviewPanel refreshToken={1} />);
    const headings = view.all("h2").map((heading) => heading.textContent);

    expect(headings).toEqual(["Locales", "Last run", "Locale file history"]);
    expect(
      metricCard(view, "Needs attention").compareDocumentPosition(localesSection(view)) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe("OverviewPanel figures, links and text direction", () => {
  const ARABIC_COMMIT: HistoryCommit = {
    hash: "aa11bb22cc33dd44",
    author: "علي حسن",
    authorDate: "2026-06-01T08:00:00.000Z",
    subject: "تحديث ملفات الترجمة العربية",
    touchedPaths: ["locales/ar.json"],
  };

  it("sets every figure in tabular sans numerals, never mono", async () => {
    stubActivity(TRACKED_RUN);

    const view = await renderAsync(<OverviewPanel refreshToken={1} />);
    const figures = view.all("[data-figure]");

    expect(figures.length).toBeGreaterThan(3);
    for (const figure of figures) {
      expect(figure.className).toContain("tabular-nums");
      expect(figure.className).not.toContain("font-mono");
    }
  });

  it("carries no native title on any element of the page", async () => {
    stubActivity(TRACKED_RUN);

    const view = await renderAsync(<OverviewPanel refreshToken={1} />);

    expect(view.query("[title]")).toBeNull();
  });

  it("links each locale row to its translations and its review queue", async () => {
    stubPage();

    const view = await renderAsync(<OverviewPanel refreshToken={1} />);
    const links = [...(coverageRows(view)[1]?.querySelectorAll("a") ?? [])];

    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "#/translations?locale=fr",
      "#/review?locale=fr",
    ]);
  });

  it("renders an Arabic commit and an Arabic locale with direction attributes that isolate them", async () => {
    stubOverview({
      "usage.summary": usageAnswer(TRACKED_RUN),
      "history.list": historyAnswer({ available: true, commits: [ARABIC_COMMIT] }),
      "status.check": checkResult([{ locale: "ar", missing: 0, stale: 0, upToDate: 5 }]),
      "status.diff": diffResult([localeDiff("ar")]),
    });

    const view = await renderAsync(<OverviewPanel refreshToken={1} />);

    expect(coverageRows(view)[0]?.querySelector("[data-locale-tag]")?.textContent).toBe("ar");
    expect(coverageRows(view)[0]?.querySelector("[data-locale-tag]")?.getAttribute("dir")).toBe(
      "ltr",
    );
    expect(commitRows(view)[0]?.querySelector("p")?.getAttribute("dir")).toBe("auto");
    expect(commitRows(view)[0]?.querySelector("time")?.getAttribute("datetime")).toBe(
      "2026-06-01T08:00:00.000Z",
    );
  });

  it("does not call the missing run status a failure: it shows the empty state beside the locales", async () => {
    stubPage();

    const view = await renderAsync(<OverviewPanel refreshToken={1} />);

    expect(view.text()).toContain("No run recorded yet");
    expect(coverageRows(view)).toHaveLength(2);
  });
});

const LOCK_BAD = rpcError(
  "LOCK_FILE_INVALID",
  "The lock-file at verbatra.lock.json is not valid JSON.",
);

function retryButton(view: RenderResult): HTMLElement {
  return view.getByText("button", "Retry");
}

describe("OverviewPanel failed reads", () => {
  it("shows N/A with a check-failed hint, never loading, when the status read failed", async () => {
    stubPage({ "status.check": rpcError("INTERNAL") });

    const view = await renderAsync(<OverviewPanel refreshToken={1} />);

    expect(metricTile(view, "Avg coverage")).toMatchObject({
      value: "N/A",
      hint: "The coverage check failed.",
    });
    expect(metricTile(view, "Locales in sync")).toMatchObject({
      value: "N/A",
      hint: "The sync check failed.",
    });
    expect(view.text()).not.toContain("Loading locale coverage.");
    expect(view.text()).not.toContain("Loading sync state.");
  });

  it("shows one page-level alert with the server's own reason and a Retry for a corrupt lock", async () => {
    stubPage({
      "status.check": LOCK_BAD,
      "status.diff": LOCK_BAD,
      "lock.state": LOCK_BAD,
    });

    const view = await renderAsync(<OverviewPanel refreshToken={1} />);

    expect(alertTexts(view)).toEqual([
      "The lock file is missing, corrupt, or at an unsupported version. The lock-file at verbatra.lock.json is not valid JSON.",
    ]);
    expect(view.all("button").filter((button) => button.textContent === "Retry")).toHaveLength(1);
    expect(view.text()).toContain("Locale coverage is unavailable.");
    expect(view.text()).toContain("Lock state is unavailable.");
    expect(view.text()).toContain("Last run");
    expect(commitRows(view)).toHaveLength(2);
  });

  it("re-reads every source once more on Retry and clears the alert when the reads recover", async () => {
    stubPage({
      "status.check": answersInOrder([LOCK_BAD, checkResult(DEFAULT_ROWS)]),
      "status.diff": answersInOrder([LOCK_BAD, diffResult(DEFAULT_LOCALES)]),
      "lock.state": answersInOrder([LOCK_BAD, NO_LOCK]),
    });
    const view = await renderAsync(<OverviewPanel refreshToken={1} />);

    expect(callCounts()).toEqual(ONCE_EACH);

    await clickAsync(retryButton(view));
    await flush();

    expect(callCounts()).toEqual(TWICE_EACH);
    expect(view.query('[role="alert"]')).toBeNull();
    expect(coverageRows(view)).toHaveLength(2);
  });

  it("does not re-read anything until Retry is pressed", async () => {
    stubPage({ "status.check": LOCK_BAD, "status.diff": LOCK_BAD, "lock.state": LOCK_BAD });

    await renderAsync(<OverviewPanel refreshToken={1} />);

    expect(callCounts()).toEqual(ONCE_EACH);
  });

  it("keeps a separate alert for a read that failed for a different reason", async () => {
    stubPage({
      "status.diff": rpcError("INTERNAL"),
      "status.check": rpcError("SOURCE_UNREADABLE", "no source file"),
    });

    const view = await renderAsync(<OverviewPanel refreshToken={1} />);

    expect(alertTexts(view)).toEqual([
      "An unexpected server error occurred. Check the terminal running Studio for details.",
      "The source locale file could not be found on disk. no source file",
    ]);
  });

  it("keeps the last lock data with a stale notice when a lock re-read fails", async () => {
    stubSyncedPage({
      "lock.state": answersInOrder([lockResult(3, []), rpcError("INTERNAL")]),
    });
    const view = await renderAsync(<OverviewPanel refreshToken={1} />);
    view.rerender(<OverviewPanel refreshToken={2} />);
    await flush();

    expect(alertTexts(view)).toEqual([
      "Showing the last known lock file. An unexpected server error occurred. Check the terminal running Studio for details.",
    ]);
    expect(view.getByText("span", "Lock v3")).not.toBeNull();
    expect(view.query("summary")).not.toBeNull();
  });

  it("keeps the stale usage notice when the last run is the empty state", async () => {
    stubPage({
      "usage.summary": answersInOrder([NO_USAGE, rpcError("INTERNAL")]),
    });
    const view = await renderAsync(<OverviewPanel refreshToken={1} />);
    view.rerender(<OverviewPanel refreshToken={2} />);
    await flush();

    expect(alertTexts(view)).toEqual([
      "Showing the last known usage. An unexpected server error occurred. Check the terminal running Studio for details.",
    ]);
    expect(view.text()).toContain("No run recorded yet");
  });
});

describe("OverviewPanel review tile and sync hint", () => {
  it("shows no review tile when the panel is given no review count", async () => {
    stubPage();

    const view = await renderAsync(<OverviewPanel refreshToken={1} />);

    expect(hasMetricCard(view, "Waiting for review")).toBe(false);
  });

  it("answers what waits for review with a count and a link to the review page", async () => {
    stubPage();

    const view = await renderAsync(
      <OverviewPanel refreshToken={1} reviewQueue={reviewQueueView(32)} />,
    );

    expect(metricTile(view, "Waiting for review")).toMatchObject({
      value: "32",
      hint: "32 translations wait for review.",
    });
    expect(metricCard(view, "Waiting for review").querySelector("a")?.getAttribute("href")).toBe(
      "#/review",
    );
  });

  it.each([
    ["loading", { kind: "loading" } as const, "…", "Checking the review queue.", false],
    [
      "failed",
      failedQueueView({ code: "INTERNAL", message: "x" }),
      "N/A",
      "The review queue check failed.",
      false,
    ],
    [
      "unreadable",
      unavailableQueueView(),
      "N/A",
      "verbatra.provenance.json is corrupt or too new to read.",
      false,
    ],
    ["empty", reviewQueueView(0), "0", "Nothing waits for review.", false],
    ["single", reviewQueueView(1), "1", "1 translation waits for review.", true],
  ])("states the review tile when the queue is %s", async (_name, queue, value, hint, linked) => {
    stubPage();

    const view = await renderAsync(<OverviewPanel refreshToken={1} reviewQueue={queue} />);

    expect(metricTile(view, "Waiting for review")).toMatchObject({ value, hint });
    expect(metricCard(view, "Waiting for review").querySelector("a") !== null).toBe(linked);
  });

  it("says orphaned keys are left over instead of claiming everything is in sync", async () => {
    stubPage({
      "status.diff": diffResult([localeDiff("de", { orphaned: ["app.legacy"] }), localeDiff("fr")]),
      "status.check": checkResult(IN_SYNC_ROWS),
    });

    const view = await renderAsync(<OverviewPanel refreshToken={1} />);

    expect(metricHint(view, "Locales in sync")).toBe(
      "Every key is translated; 1 orphaned key is left over.",
    );
  });

  it("says all locales are in sync only when no change is pending", async () => {
    stubSyncedPage();

    const view = await renderAsync(<OverviewPanel refreshToken={1} />);

    expect(metricHint(view, "Locales in sync")).toBe("All target locales are in sync.");
  });
});

describe("OverviewPanel locale table size and order", () => {
  function manyRows(count: number): readonly CoverageCounts[] {
    return Array.from({ length: count }, (_, index) => ({
      locale: `l${String(index).padStart(2, "0")}`,
      missing: index,
      stale: 0,
      upToDate: 100 - index,
    }));
  }

  it("lists the worst covered locales first", async () => {
    stubPage({ "status.check": checkResult(manyRows(4)), "status.diff": diffResult([]) });

    const view = await renderAsync(<OverviewPanel refreshToken={1} />);
    const tags = coverageRows(view).map(
      (row) => row.querySelector("[data-locale-tag]")?.textContent,
    );

    expect(tags).toEqual(["l03", "l02", "l01", "l00"]);
  });

  it("shows ten locales and a button for all of them, then moves focus to the first new row", async () => {
    stubPage({ "status.check": checkResult(manyRows(25)), "status.diff": diffResult([]) });
    const view = await renderAsync(<OverviewPanel refreshToken={1} />);

    expect(coverageRows(view)).toHaveLength(10);

    await clickAsync(view.getByText("button", "Show all 25 locales"));

    expect(coverageRows(view)).toHaveLength(25);
    expect(view.query("button")).toBeNull();
    expect(document.activeElement).toBe(coverageRows(view)[10]?.querySelector("a"));
  });

  it("offers no show-all button for ten locales or fewer", async () => {
    stubPage({ "status.check": checkResult(manyRows(10)), "status.diff": diffResult([]) });

    const view = await renderAsync(<OverviewPanel refreshToken={1} />);

    expect(view.query("button")).toBeNull();
    expect(coverageRows(view)).toHaveLength(10);
  });
});

describe("OverviewPanel shared failure across every read", () => {
  it("shows one alert when every read fails for the same reason", async () => {
    stubPage({
      "status.diff": rpcError("INTERNAL"),
      "status.check": rpcError("INTERNAL"),
      "lock.state": rpcError("INTERNAL"),
      "usage.summary": rpcError("INTERNAL"),
      "history.list": rpcError("INTERNAL"),
    });

    const view = await renderAsync(<OverviewPanel refreshToken={1} />);

    expect(alertTexts(view)).toHaveLength(1);
    expect(view.text()).toContain("The last run is unavailable. See the error above.");
    expect(view.text()).toContain("File history is unavailable. See the error above.");
    expect(view.text()).toContain("Locale coverage is unavailable. See the error above.");
  });

  it("keeps the alert of a usage or history read that failed for another reason", async () => {
    stubPage({
      "status.diff": rpcError("INTERNAL"),
      "usage.summary": rpcError("SNAPSHOT_UNREADABLE", "run file unreadable"),
      "history.list": rpcError("HISTORY_READ_FAILED", "git is not installed"),
    });

    const view = await renderAsync(<OverviewPanel refreshToken={1} />);

    expect(alertTexts(view)).toEqual([
      "An unexpected server error occurred. Check the terminal running Studio for details.",
      "run file unreadable",
      "git is not installed",
    ]);
  });

  it("hides a stale history notice that repeats the page-level error", async () => {
    stubPage({
      "status.diff": rpcError("INTERNAL"),
      "history.list": answersInOrder([historyAnswer(LOADED_HISTORY), rpcError("INTERNAL")]),
    });
    const view = await renderAsync(<OverviewPanel refreshToken={1} />);
    view.rerender(<OverviewPanel refreshToken={2} />);
    await flush();

    expect(alertTexts(view)).toHaveLength(1);
    expect(commitRows(view)).toHaveLength(2);
  });
});

describe("OverviewPanel review failures, retry and focus", () => {
  const INTERNAL = { code: "INTERNAL", message: "boom" };

  it("shows a failed review read as the page alert with a Retry, not as a silent N/A", async () => {
    stubPage();

    const view = await renderAsync(
      <OverviewPanel refreshToken={1} reviewQueue={failedQueueView(INTERNAL)} />,
    );

    expect(alertTexts(view)).toEqual([
      "An unexpected server error occurred. Check the terminal running Studio for details.",
    ]);
    expect(metricFigure(view, "Waiting for review").textContent).toBe("N/A");
    expect(view.all("button").filter((button) => button.textContent === "Retry")).toHaveLength(1);
  });

  it("asks its owner to re-read when it is given a retry handler, and bumps nothing itself", async () => {
    stubPage({ "lock.state": LOCK_BAD });
    let asked = 0;
    const view = await renderAsync(
      <OverviewPanel
        refreshToken={1}
        onRetry={() => {
          asked += 1;
        }}
      />,
    );

    await clickAsync(retryButton(view));
    await flush();

    expect(asked).toBe(1);
    expect(callCounts()).toEqual(ONCE_EACH);
  });

  it("moves focus to the metric row after a Retry that recovers", async () => {
    stubPage({ "lock.state": answersInOrder([LOCK_BAD, NO_LOCK]) });
    const view = await renderAsync(<OverviewPanel refreshToken={1} />);
    retryButton(view).focus();

    await clickAsync(retryButton(view));
    await flush();

    expect(view.query('[role="alert"]')).toBeNull();
    expect(document.activeElement).toBe(view.get("[data-overview-recovery]"));
    expect(view.get("[data-overview-recovery]").getAttribute("tabindex")).toBe("-1");
  });

  it("keeps focus on Retry when the Retry fails again", async () => {
    stubPage({ "lock.state": LOCK_BAD });
    const view = await renderAsync(<OverviewPanel refreshToken={1} />);
    retryButton(view).focus();

    await clickAsync(retryButton(view));
    await flush();

    expect(document.activeElement).toBe(retryButton(view));
    expect(document.activeElement).not.toBe(view.get("[data-overview-recovery]"));
  });

  it("leaves focus where it is when a failure clears later by a refresh, not by the Retry", async () => {
    stubPage({ "lock.state": answersInOrder([LOCK_BAD, LOCK_BAD, NO_LOCK]) });
    const view = await renderAsync(<OverviewPanel refreshToken={1} />);
    await clickAsync(retryButton(view));
    await flush();
    const elsewhere = document.createElement("button");
    document.body.append(elsewhere);
    elsewhere.focus();

    view.rerender(<OverviewPanel refreshToken={2} />);
    await flush();

    expect(view.query('[role="alert"]')).toBeNull();
    expect(document.activeElement).toBe(elsewhere);
    elsewhere.remove();
  });

  it("names every stale source in one alert with one Retry, usage and history included", async () => {
    stubOverview({
      "status.diff": answersInOrder([diffResult(DEFAULT_LOCALES), rpcError("INTERNAL")]),
      "status.check": answersInOrder([checkResult(DEFAULT_ROWS), rpcError("INTERNAL")]),
      "lock.state": answersInOrder([lockResult(3, []), rpcError("INTERNAL")]),
      "usage.summary": answersInOrder([usageAnswer(TRACKED_RUN), rpcError("INTERNAL")]),
      "history.list": answersInOrder([historyAnswer(LOADED_HISTORY), rpcError("INTERNAL")]),
    });
    const view = await renderAsync(<OverviewPanel refreshToken={1} />);
    view.rerender(<OverviewPanel refreshToken={2} />);
    await flush();

    expect(alertTexts(view)).toHaveLength(1);
    expect(alertText(view)).toContain(
      "Showing the last known pending changes, coverage, lock file, usage and history.",
    );
    expect(view.all("button").filter((button) => button.textContent === "Retry")).toHaveLength(1);
    expect(metricValue(view, "Input tokens")).toBe("640");
    expect(commitRows(view)).toHaveLength(2);
  });

  it("still says what is stale when another read has a hard error with the same code", async () => {
    stubPage({
      "status.check": rpcError("INTERNAL"),
      "lock.state": answersInOrder([lockResult(3, []), rpcError("INTERNAL")]),
    });
    const view = await renderAsync(<OverviewPanel refreshToken={1} />);
    view.rerender(<OverviewPanel refreshToken={2} />);
    await flush();

    expect(alertTexts(view)).toEqual([
      "Showing the last known lock file. An unexpected server error occurred. Check the terminal running Studio for details.",
    ]);
  });

  it("does not move focus into the history after a failed Show more and a later refresh", async () => {
    stubOverview({
      "history.list": answersInOrder([
        historyAnswer({ available: true, commits: COMMITS_OF(10) }),
        rpcError("INTERNAL"),
        historyAnswer({ available: true, commits: COMMITS_OF(15) }),
      ]),
    });
    const view = await renderAsync(<OverviewPanel refreshToken={1} />);
    await clickAsync(view.getByText("button", "Show more commits"));
    await flush();
    const elsewhere = document.createElement("button");
    document.body.append(elsewhere);
    elsewhere.focus();

    view.rerender(<OverviewPanel refreshToken={2} />);
    await flush();

    expect(document.activeElement).toBe(elsewhere);
    elsewhere.remove();
  });
});

function COMMITS_OF(count: number): readonly HistoryCommit[] {
  return Array.from({ length: count }, (_, index) => ({
    hash: `${String(index).padStart(2, "0")}f3ab19c7d5e4a2b`,
    author: "Ada Lovelace",
    authorDate: "2026-05-04T09:00:00.000Z",
    subject: `commit ${index}`,
    touchedPaths: [],
  }));
}

describe("OverviewPanel one Retry and focus after a failed Retry", () => {
  it("carries one Retry when a lock failure and a usage failure have different codes", async () => {
    stubPage({ "lock.state": LOCK_BAD, "usage.summary": rpcError("NETWORK_ERROR") });

    const view = await renderAsync(<OverviewPanel refreshToken={1} />);

    expect(alertTexts(view)).toHaveLength(2);
    expect(view.all("button").filter((button) => button.textContent === "Retry")).toHaveLength(1);
  });

  it("carries one Retry when a lock failure and a history failure have different codes", async () => {
    stubPage({ "lock.state": LOCK_BAD, "history.list": rpcError("NETWORK_ERROR") });

    const view = await renderAsync(<OverviewPanel refreshToken={1} />);

    expect(alertTexts(view)).toHaveLength(2);
    expect(view.all("button").filter((button) => button.textContent === "Retry")).toHaveLength(1);
  });

  it("carries one Retry when a stale history of another code follows a hard lock failure", async () => {
    stubPage({
      "lock.state": LOCK_BAD,
      "history.list": answersInOrder([historyAnswer(LOADED_HISTORY), rpcError("NETWORK_ERROR")]),
    });
    const view = await renderAsync(<OverviewPanel refreshToken={1} />);
    view.rerender(<OverviewPanel refreshToken={2} />);
    await flush();

    expect(alertTexts(view)).toHaveLength(2);
    expect(commitRows(view)).toHaveLength(2);
    expect(view.all("button").filter((button) => button.textContent === "Retry")).toHaveLength(1);
  });

  it("does not move focus when a failure clears in the background after a failed Retry", async () => {
    stubPage({ "lock.state": answersInOrder([LOCK_BAD, LOCK_BAD, NO_LOCK]) });
    const view = await renderAsync(<OverviewPanel refreshToken={1} />);
    retryButton(view).focus();
    await clickAsync(retryButton(view));
    await flush();
    const focus = vi.spyOn(HTMLElement.prototype, "focus");

    view.rerender(<OverviewPanel refreshToken={2} />);
    await flush();

    expect(view.query('[role="alert"]')).toBeNull();
    expect(focus).not.toHaveBeenCalled();
    focus.mockRestore();
  });

  it("does not move focus from the body when a failure clears after a failed Retry", async () => {
    stubPage({ "lock.state": answersInOrder([LOCK_BAD, LOCK_BAD, NO_LOCK]) });
    const view = await renderAsync(<OverviewPanel refreshToken={1} />);
    await clickAsync(retryButton(view));
    await flush();
    (document.activeElement as HTMLElement | null)?.blur();

    view.rerender(<OverviewPanel refreshToken={2} />);
    await flush();

    expect(view.query('[role="alert"]')).toBeNull();
    expect(document.activeElement).toBe(document.body);
  });

  it("waits for every read to answer before it decides about focus", async () => {
    let answer: ((result: StubRpcResult) => void) | undefined;
    let statusReads = 0;
    stubPage({
      "lock.state": answersInOrder([LOCK_BAD, NO_LOCK]),
      "status.check": () => {
        statusReads += 1;
        return statusReads === 1
          ? checkResult(DEFAULT_ROWS)
          : new Promise<StubRpcResult>((resolve) => {
              answer = resolve;
            });
      },
    });
    const view = await renderAsync(<OverviewPanel refreshToken={1} />);
    retryButton(view).focus();

    await clickAsync(retryButton(view));
    await flush();
    answer?.(checkResult(DEFAULT_ROWS));
    await flush();

    expect(view.query('[role="alert"]')).toBeNull();
    expect(document.activeElement).toBe(view.get("[data-overview-recovery]"));
  });
});

describe("OverviewPanel repeated and edge notices", () => {
  it("hides a stale usage notice that repeats the page-level error, but names usage in it", async () => {
    stubPage({
      "status.diff": rpcError("INTERNAL"),
      "usage.summary": answersInOrder([usageAnswer(TRACKED_RUN), rpcError("INTERNAL")]),
    });
    const view = await renderAsync(<OverviewPanel refreshToken={1} />);
    view.rerender(<OverviewPanel refreshToken={2} />);
    await flush();

    expect(alertTexts(view)).toHaveLength(1);
    expect(alertText(view)).toContain("Showing the last known usage.");
    expect(metricValue(view, "Input tokens")).toBe("640");
  });

  it("moves focus to the last commit when Show more brings no new commit", async () => {
    stubOverview({
      "history.list": (params: unknown) => {
        const asked = (params as { limit?: number }).limit ?? 50;
        return historyAnswer({ available: true, commits: COMMITS_OF(Math.min(asked, 10)) });
      },
    });
    const view = await renderAsync(<OverviewPanel refreshToken={1} />);

    await clickAsync(view.getByText("button", "Show more commits"));
    await flush();

    expect(commitRows(view)).toHaveLength(10);
    expect(document.activeElement).toBe(commitRows(view)[9]);
  });

  it("shows its own stale usage notice, without a Retry, when the page error has another code", async () => {
    stubPage({
      "status.diff": rpcError("INTERNAL"),
      "usage.summary": answersInOrder([usageAnswer(TRACKED_RUN), rpcError("NETWORK_ERROR")]),
    });
    const view = await renderAsync(<OverviewPanel refreshToken={1} />);
    view.rerender(<OverviewPanel refreshToken={2} />);
    await flush();

    expect(alertTexts(view)).toHaveLength(2);
    expect(alertTexts(view)[1]).toContain("Showing the last known usage.");
    expect(view.all("button").filter((button) => button.textContent === "Retry")).toHaveLength(1);
  });
});

describe("OverviewPanel Retry stays disabled until every read it started has answered", () => {
  const METHODS = ["status.diff", "status.check", "lock.state", "usage.summary", "history.list"];
  const ANSWERS: Readonly<Record<string, StubRpcResult>> = {
    "status.diff": diffResult(DEFAULT_LOCALES),
    "status.check": checkResult(DEFAULT_ROWS),
    "lock.state": LOCK_BAD,
    "usage.summary": usageAnswer(TRACKED_RUN),
    "history.list": historyAnswer(LOADED_HISTORY),
  };

  function holdOnRetry(): Readonly<Record<string, (result: StubRpcResult) => void>> {
    const resolvers: Record<string, (result: StubRpcResult) => void> = {};
    const stubs: Record<string, StubRpcHandler> = {};
    for (const method of METHODS) {
      let calls = 0;
      stubs[method] = () => {
        calls += 1;
        return calls === 1
          ? (ANSWERS[method] as StubRpcResult)
          : new Promise<StubRpcResult>((resolve) => {
              resolvers[method] = resolve;
            });
      };
    }
    stubPage(stubs);
    return resolvers;
  }

  function disabled(view: RenderResult): string | null {
    return (
      view
        .all("button")
        .find((button) => /^Retry/.test(button.textContent ?? ""))
        ?.getAttribute("aria-disabled") ?? null
    );
  }

  it.each([[[0, 1, 2, 3, 4]], [[4, 3, 2, 1, 0]], [[2, 0, 4, 1, 3]], [[3, 4, 0, 2, 1]]])(
    "does not clear early and does not stick when the reads answer in order %j",
    async (order) => {
      const resolvers = holdOnRetry();
      const view = await renderAsync(<OverviewPanel refreshToken={1} />);
      expect(disabled(view)).toBeNull();

      await clickAsync(retryButton(view));
      await flush();
      expect(disabled(view)).toBe("true");

      for (const [position, index] of order.entries()) {
        const method = METHODS[index] as string;
        resolvers[method]?.(ANSWERS[method] as StubRpcResult);
        await flush();
        if (position < order.length - 1) {
          expect(disabled(view)).toBe("true");
        }
      }

      expect(disabled(view)).toBeNull();
      expect(view.all("button").some((button) => button.textContent === "Retry")).toBe(true);
    },
  );

  it("is not left disabled by a review queue that this panel does not re-read", async () => {
    stubPage({ "lock.state": LOCK_BAD });
    const view = await renderAsync(
      <OverviewPanel refreshToken={1} reviewQueue={reviewQueueView(2)} />,
    );

    await clickAsync(retryButton(view));
    await flush();

    expect(disabled(view)).toBeNull();
  });

  it("waits for the review queue its owner re-reads when it was given a retry handler", async () => {
    stubPage({ "lock.state": LOCK_BAD });
    const first = reviewQueueView(2);
    const view = await renderAsync(
      <OverviewPanel refreshToken={1} reviewQueue={first} onRetry={() => {}} />,
    );

    await clickAsync(retryButton(view));
    await flush();
    expect(disabled(view)).toBe("true");

    view.rerender(
      <OverviewPanel refreshToken={1} reviewQueue={reviewQueueView(2)} onRetry={() => {}} />,
    );
    await flush();
    view.rerender(
      <OverviewPanel refreshToken={2} reviewQueue={reviewQueueView(2)} onRetry={() => {}} />,
    );
    await flush();

    expect(disabled(view)).toBeNull();
  });

  it("places the page alert above the metric tiles", async () => {
    stubPage({ "lock.state": LOCK_BAD });

    const view = await renderAsync(<OverviewPanel refreshToken={1} />);

    const position = view
      .get('[role="alert"]')
      .compareDocumentPosition(view.get("[data-overview-recovery]"));
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
