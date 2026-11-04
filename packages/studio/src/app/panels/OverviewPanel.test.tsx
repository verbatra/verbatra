// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import type { DiffLocale } from "../../client/diff-view.js";
import { formatTimestamp } from "../../client/ui-format.js";
import type { HistoryCommit, HistoryListResult } from "../../shared/rpc/history.js";
import type { UsageSummaryResult } from "../../shared/rpc/usage-summary.js";
import type { RenderResult, StubRpcHandler, StubRpcResult } from "../test-support.js";
import {
  clickAsync,
  flush,
  render,
  renderAsync,
  rpcCalls,
  rpcError,
  stubRpc,
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

function metricCard(view: RenderResult, label: string): HTMLElement {
  const card = view.getByText("span", label).parentElement?.parentElement;
  if (card === null || card === undefined) {
    throw new Error(`no metric card is labeled ${JSON.stringify(label)}`);
  }
  return card;
}

function metricValue(view: RenderResult, label: string): string | null {
  return metricCard(view, label).querySelector("div[title]")?.getAttribute("title") ?? null;
}

function metricHint(view: RenderResult, label: string): string | null {
  return metricCard(view, label).querySelector("p")?.textContent ?? null;
}

function alertText(view: RenderResult): string {
  return view.get('[role="alert"]').textContent?.trim() ?? "";
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

function coverageRows(view: RenderResult): HTMLElement[] {
  const table = view.getByText("h2", "Locales").closest("section")?.querySelector("table") ?? null;
  if (table === null) {
    throw new Error("the Locales section rendered no coverage table");
  }
  return [...table.querySelectorAll<HTMLElement>("tbody tr")];
}

function cellTexts(row: HTMLElement | undefined): string[] {
  if (row === undefined) {
    throw new Error("the expected table row is missing");
  }
  return [...row.querySelectorAll("td")].map((cell) => cell.textContent ?? "");
}

function alertTexts(view: RenderResult): string[] {
  return view.all('[role="alert"]').map((alert) => alert.textContent ?? "");
}

function metricTile(
  view: RenderResult,
  label: string,
): { readonly value: string; readonly hint: string; readonly meterWidth: string | null } {
  const card = view.getByText("span", label).parentElement?.parentElement ?? null;
  if (card === null) {
    throw new Error(`no metric tile is labelled ${label}`);
  }
  const meter = card.querySelector<HTMLElement>("span[style]");
  return {
    value: card.querySelector("div[title]")?.getAttribute("title") ?? "",
    hint: card.querySelector("p")?.textContent ?? "",
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
    const rows = view.all("ul.max-w-3xl > li");

    expect(rows).toHaveLength(2);
    expect(view.text()).toContain("chore: sync the German locale file");
    expect(view.text()).toContain("0f3ab19");
    expect(view.text()).toContain("2026-05-04");
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
    expect(view.query("div[title='640']")).toBeNull();
  });

  it("renders a tracked budget as a meter plus a within-budget badge", async () => {
    stubActivity(TRACKED_RUN);

    const view = await renderAsync(<OverviewPanel refreshToken={0} />);
    const meter = metricCard(view, "Budget").querySelector<HTMLElement>('[style*="width"]');

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
    const meter = metricCard(view, "Budget").querySelector<HTMLElement>('[style*="width"]');

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
    const meter = metricCard(view, "Budget").querySelector<HTMLElement>('[style*="width"]');
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

    expect(view.getByText("h2", "Locales").parentElement?.textContent).toBe("LocalesLock v9");
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
      hint: "2 keys need attention (3 entries across 2 of 2 target locales).",
    });
  });

  it("says locale rather than locales for a single-locale project", async () => {
    stubPage({
      "status.diff": diffResult([localeDiff("de", { missing: ["app.title"] })]),
      "status.check": checkResult([{ locale: "de", missing: 1, stale: 0, upToDate: 9 }]),
    });

    const view = await renderAsync(<OverviewPanel refreshToken={1} />);

    expect(metricTile(view, "Needs attention").hint).toBe(
      "1 key needs attention (1 entry across 1 of 1 target locale).",
    );
    expect(metricTile(view, "Avg coverage").hint).toBe("Across 1 target locale.");
  });

  it("states the attention hint without waiting for the coverage read", async () => {
    stubPage({ "status.check": PENDING });

    const view = await renderAsync(<OverviewPanel refreshToken={1} />);

    expect(metricTile(view, "Needs attention").hint).toBe(
      "2 keys need attention (3 entries across 2 of 2 target locales).",
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

    expect(alertTexts(view)).toEqual(["The source locale file could not be found on disk."]);
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
      "Showing the last known status. Studio is limiting how often this action can run. Wait a moment and try again.",
    ]);
    expect(coverageRows(view)).toHaveLength(2);
  });

  it("renders one coverage row per locale, with its percentage and key counts", async () => {
    stubPage();

    const view = await renderAsync(<OverviewPanel refreshToken={1} />);

    expect(cellTexts(coverageRows(view)[0])).toEqual(["de", "80%8 / 10 keys", "1", "1", "8"]);
  });

  it("names the lock version next to the section heading", async () => {
    stubSyncedPage({ "lock.state": lockResult(3, []) });

    const view = await renderAsync(<OverviewPanel refreshToken={1} />);

    expect(view.getByText("h2", "Locales").parentElement?.textContent).toBe("LocalesLock v3");
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
      "Drift",
      "In step",
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

    const detail = view.getByText("summary", "Lock file details").parentElement;

    expect(cellTexts(detail?.querySelector<HTMLElement>("tbody tr") ?? undefined)).toEqual([
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

    const detail = view.getByText("summary", "Lock file details").parentElement;

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
      "The lock file is missing, corrupt, or at an unsupported version.",
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
    ).toContain("keys need attention");
  });

  it("counts a locale whose only drift is orphaned keys, with a link that lists them", async () => {
    stubPage({
      "status.diff": diffResult([localeDiff("de", { orphaned: ["app.legacy"] }), localeDiff("fr")]),
    });

    const view = await renderAsync(<OverviewPanel refreshToken={1} />);

    expect(metricTile(view, "Needs attention")).toMatchObject({
      value: "1",
      hint: "1 key needs attention (1 entry across 1 of 2 target locales).",
    });
    expect(view.query('a[href*="status=orphaned"]')).not.toBeNull();
  });

  it("offers no attention link when everything is in sync", async () => {
    stubSyncedPage();

    const view = await renderAsync(<OverviewPanel refreshToken={1} />);

    expect(view.query('a[href^="#/translations"]')).toBeNull();
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
    return view.all("ul.max-w-3xl > li").length;
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

  it("moves focus to the history region when the last page removes the button", async () => {
    stubHistoryByLimit(14);
    const view = await renderAsync(<OverviewPanel refreshToken={1} />);
    await clickAsync(view.getByText("button", "Show more commits"));
    await flush();

    const region = view.get("ul.max-w-3xl").parentElement;

    expect(document.activeElement).toBe(region);
    expect(region?.getAttribute("tabindex")).toBe("-1");
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
});
