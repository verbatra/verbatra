// @vitest-environment jsdom
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DiffLocale } from "../../client/diff-view.js";
import { MAX_RENDERED_KEYS } from "../../client/filter.js";
import { buildReviewReportMarkdown } from "../../client/review-report.js";
import type { RenderResult, StubRpcHandler, StubRpcResult } from "../test-support.js";
import {
  clickAsync,
  flush,
  render,
  renderAsync,
  reviewOverlayStore,
  rpcCalls,
  rpcError,
  selectOption,
  stubRpc,
  typeInto,
} from "../test-support.js";
import { TranslationsPanel } from "./TranslationsPanel.js";

vi.mock("../api.js", () => import("../test-support.js").then((module) => module.apiMock()));

const writeText = vi.fn<(text: string) => Promise<void>>();
Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

beforeEach(() => {
  writeText.mockReset();
  writeText.mockResolvedValue(undefined);
});

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

type Stubs = Readonly<Record<string, StubRpcResult | StubRpcHandler>>;

function stubPage(overrides: Stubs = {}): void {
  stubRpc({
    "status.diff": diffResult(DEFAULT_LOCALES),
    "status.check": checkResult(DEFAULT_ROWS),
    "lock.state": NO_LOCK,
    "usage.summary": NO_USAGE,
    ...overrides,
  });
}

function stubSyncedPage(overrides: Stubs = {}): void {
  stubPage({
    "status.diff": diffResult(IN_SYNC_LOCALES),
    "status.check": checkResult(IN_SYNC_ROWS),
    ...overrides,
  });
}

function drawerStubs(): Stubs {
  return {
    "project.snapshot": { ok: true, result: { capabilities: { spend: false, writeToDisk: true } } },
    "key.integrity": { ok: true, result: { locales: [] } },
    "key.value": { ok: true, result: { source: "Hello", target: "Hallo" } },
    "key.context": {
      ok: true,
      result: { source: "Hello", target: "Hallo", glossary: { terms: [], doNotTranslate: [] } },
    },
    "history.list": { ok: true, result: { available: false } },
  };
}

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

function sectionTitles(view: RenderResult): string[] {
  return view.all("h2").map((heading) => heading.textContent ?? "");
}

function alertTexts(view: RenderResult): string[] {
  return view.all('[role="alert"]').map((alert) => alert.textContent ?? "");
}

function filterInput(view: RenderResult): HTMLInputElement {
  const input = view.get('input[type="search"]');
  if (!(input instanceof HTMLInputElement)) {
    throw new Error("the key filter is not an input element");
  }
  return input;
}

async function switchToList(view: RenderResult): Promise<void> {
  await clickAsync(view.getByText("button", "List"));
}

async function openKeyDrawer(view: RenderResult, key: string, locale: string): Promise<void> {
  await clickAsync(view.get(`button[aria-label^="${key} in ${locale}"]`));
  await flush();
}

describe("TranslationsPanel", () => {
  it("names the page in its header", async () => {
    stubPage();

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    expect(view.get("h1").textContent).toBe("Translations");
  });

  it("shows a loading indicator while the pending-change read is still open", () => {
    stubPage({ "status.diff": PENDING });

    const view = render(<TranslationsPanel refreshToken={1} />);

    expect(view.all('[role="status"]').map((element) => element.textContent)).toContain(
      "Loading...",
    );
  });

  it("withholds the review-report action until the diff has loaded", () => {
    stubPage({ "status.diff": PENDING });

    const view = render(<TranslationsPanel refreshToken={1} />);

    expect(view.query("header button")).toBeNull();
  });

  it("offers the review-report action once the diff has loaded", async () => {
    stubPage();

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    expect(view.query("header button")?.textContent).toBe("Copy as review report");
  });

  it("reads the whole project's diff, with no locale filter", async () => {
    stubPage();

    await renderAsync(<TranslationsPanel refreshToken={1} />);

    expect(rpcCalls).toContainEqual({ method: "status.diff", params: {} });
  });

  it("re-reads the diff and the lock state on every refresh token change", async () => {
    stubPage();
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    view.rerender(<TranslationsPanel refreshToken={2} />);
    await flush();

    expect(rpcCalls.filter((call) => call.method === "status.diff")).toHaveLength(2);
    expect(rpcCalls.filter((call) => call.method === "lock.state")).toHaveLength(2);
  });

  it("renders the hard error state when the very first diff read fails", async () => {
    stubPage({ "status.diff": rpcError("SOURCE_INVALID", "unparseable") });

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    expect(alertTexts(view)).toEqual([
      "The source locale file could not be read or parsed for the configured format.",
    ]);
  });

  it("hides the key explorer while the diff is in the hard error state", async () => {
    stubPage({ "status.diff": rpcError("SOURCE_INVALID", "unparseable") });

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    expect(sectionTitles(view)).not.toContain("Keys");
  });

  it("keeps the last good pending changes on screen when a re-read fails", async () => {
    stubPage({
      "status.diff": answersInOrder([diffResult(DEFAULT_LOCALES), rpcError("INTERNAL", "gone")]),
    });
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    view.rerender(<TranslationsPanel refreshToken={2} />);
    await flush();

    expect(alertTexts(view)).toEqual([
      "Showing the last known pending changes. An unexpected server error occurred. Check the terminal running Studio for details.",
    ]);
    expect(sectionTitles(view)).toContain("Keys");
  });

  it("ignores a diff response that a later refresh already superseded", async () => {
    const diff = deferredAnswers();
    stubPage({ "status.diff": diff.handler });
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    view.rerender(<TranslationsPanel refreshToken={2} />);

    diff.answer(1, diffResult([localeDiff("de", { missing: ["fresh.key"] })]));
    await flush();
    diff.answer(0, diffResult([localeDiff("de", { missing: ["superseded.key"] })]));
    await flush();

    expect(view.text()).toContain("fresh.key");
    expect(view.text()).not.toContain("superseded.key");
  });

  it("ignores a lock response that a later refresh already superseded", async () => {
    const lock = deferredAnswers();
    stubSyncedPage({ "lock.state": lock.handler });
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    view.rerender(<TranslationsPanel refreshToken={2} />);

    lock.answer(1, lockResult(9, []));
    await flush();
    lock.answer(0, lockResult(1, []));
    await flush();

    expect(view.getByText("h2", "Locales").parentElement?.textContent).toBe("LocalesLock v9");
  });
});

describe("TranslationsPanel all-clear state", () => {
  it("banners an empty project as fully in sync", async () => {
    stubPage({ "status.diff": diffResult([]), "status.check": checkResult([]) });

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    expect(view.get('[role="status"]').textContent).toContain("Everything is in sync");
  });

  it("hides the key explorer when nothing is pending", async () => {
    stubSyncedPage();

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    expect(sectionTitles(view)).not.toContain("Keys");
  });

  it("keeps the integrity filter reachable when nothing is pending but a translation is broken", async () => {
    stubSyncedPage({
      "review.queue": { ok: true, result: { available: false } },
      "locale.integrity": {
        ok: true,
        result: {
          locales: [
            {
              locale: "de",
              entries: [integrityEntry("app.body", false)],
            },
          ],
        },
      },
    });

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await flush();

    expect(view.get('[role="status"]').textContent).toContain("integrity problems");
    expect(sectionTitles(view)).toContain("Keys");
    expect(view.all("button").some((button) => button.textContent === "Grid")).toBe(false);
    expect(statusToggle(view, "integrity").textContent).toBe("Integrity problems1");
    expect(headings(view)).toContain("Integrity problems(1)");
  });

  it("keeps the key explorer hidden when nothing is pending and every translation passes", async () => {
    stubSyncedPage({
      "locale.integrity": { ok: true, result: { locales: [{ locale: "de", entries: [] }] } },
    });

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await flush();

    expect(sectionTitles(view)).not.toContain("Keys");
    expect(view.get('[role="status"]').textContent).not.toContain("integrity problems");
  });

  it("reads a project with no target locales as fully covered", async () => {
    stubPage({ "status.diff": diffResult([]), "status.check": checkResult([]) });

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    expect(metricTile(view, "Avg coverage")).toMatchObject({
      value: "100%",
      hint: "Across 0 target locales.",
    });
  });

  it("still explores keys for a locale whose only drift is orphaned", async () => {
    stubPage({
      "status.diff": diffResult([localeDiff("de", { orphaned: ["app.legacy"] })]),
      "status.check": checkResult([{ locale: "de", missing: 0, stale: 0, upToDate: 10 }]),
    });

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    expect(sectionTitles(view)).toContain("Keys");
    expect(view.query('[role="status"]')).toBeNull();
  });
});

describe("TranslationsPanel stat strip", () => {
  const generatedAt = "2026-08-01T10:00:00.000Z";

  it("withholds an attention figure while the diff is still loading", () => {
    stubPage({ "status.diff": PENDING });

    const view = render(<TranslationsPanel refreshToken={1} />);

    expect(metricTile(view, "Needs attention")).toMatchObject({
      value: "…",
      hint: "Checking pending changes.",
    });
  });

  it("marks the attention figure unavailable when the diff read failed", async () => {
    stubPage({ "status.diff": rpcError("INTERNAL", "gone") });

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    expect(metricTile(view, "Needs attention")).toMatchObject({
      value: "N/A",
      hint: "The pending-change check failed; details below.",
    });
  });

  it("reads zero keys needing attention when every locale is in sync", async () => {
    stubSyncedPage();

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    expect(metricTile(view, "Needs attention")).toMatchObject({
      value: "0",
      hint: "Everything is in sync.",
    });
  });

  it("counts the distinct drift keys across every locale", async () => {
    stubPage();

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    expect(metricTile(view, "Needs attention")).toMatchObject({
      value: "2",
      hint: "Across 2 of 2 target locales.",
    });
  });

  it("says locale rather than locales for a single-locale project", async () => {
    stubPage({
      "status.diff": diffResult([localeDiff("de", { missing: ["app.title"] })]),
      "status.check": checkResult([{ locale: "de", missing: 1, stale: 0, upToDate: 9 }]),
    });

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    expect(metricTile(view, "Needs attention").hint).toBe("Across 1 of 1 target locale.");
    expect(metricTile(view, "Avg coverage").hint).toBe("Across 1 target locale.");
  });

  it("falls back to a vague attention hint until the coverage read answers", async () => {
    stubPage({ "status.check": PENDING });

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    expect(metricTile(view, "Needs attention").hint).toBe("Across your target locales.");
  });

  it("withholds the coverage figure and its meter while the coverage read is open", async () => {
    stubSyncedPage({ "status.check": PENDING });

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    expect(metricTile(view, "Avg coverage")).toEqual({
      value: "…",
      hint: "Loading locale coverage.",
      meterWidth: null,
    });
  });

  it("meters the mean coverage once the rows are in", async () => {
    stubPage();

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    expect(metricTile(view, "Avg coverage")).toEqual({
      value: "85%",
      hint: "Across 2 target locales.",
      meterWidth: "85%",
    });
  });

  it("withholds the in-sync tally while the coverage read is open", async () => {
    stubSyncedPage({ "status.check": PENDING });

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    expect(metricTile(view, "Locales in sync")).toMatchObject({
      value: "…",
      hint: "Loading sync state.",
    });
  });

  it("tallies how many locales are in sync when some are behind", async () => {
    stubPage();

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    expect(metricTile(view, "Locales in sync")).toMatchObject({
      value: "0 / 2",
      hint: "At least one locale is out of sync.",
    });
  });

  it("tallies every locale as in sync when none is behind", async () => {
    stubSyncedPage();

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    expect(metricTile(view, "Locales in sync")).toMatchObject({
      value: "2 / 2",
      hint: "All target locales are in sync.",
    });
  });

  it("withholds the last run while the usage read is open", async () => {
    stubPage({ "usage.summary": PENDING });

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    expect(metricTile(view, "Last run")).toMatchObject({
      value: "…",
      hint: "Loading the last recorded run.",
    });
  });

  it("points at the CLI when no run has been recorded yet", async () => {
    stubPage();

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    expect(metricTile(view, "Last run")).toMatchObject({
      value: "No run yet",
      hint: "Run verbatra translate or watch to record one.",
    });
  });

  it("summarizes the last run's tokens and flags a reached budget ceiling", async () => {
    stubPage({
      "usage.summary": {
        ok: true,
        result: {
          available: true,
          generatedAt,
          usage: { inputTokens: 12345, outputTokens: 678 },
          budget: {
            maxTokens: 1000,
            behavior: "warn",
            supported: true,
            tokensUsed: 1200,
            exceeded: true,
          },
        },
      },
    });

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    expect(metricTile(view, "Last run")).toMatchObject({
      value: `${(12345).toLocaleString()} / ${(678).toLocaleString()}`,
      hint: `Tokens in / out. Budget ceiling reached. As of ${new Date(generatedAt).toLocaleString()}`,
    });
  });

  it("reports a tracked budget that is still within its ceiling", async () => {
    stubPage({
      "usage.summary": {
        ok: true,
        result: {
          available: true,
          generatedAt,
          usage: { inputTokens: 10, outputTokens: 20 },
          budget: {
            maxTokens: 1000,
            behavior: "stop",
            supported: true,
            tokensUsed: 500,
            exceeded: false,
          },
        },
      },
    });

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    expect(metricTile(view, "Last run").hint).toBe(
      `Tokens in / out. Within budget. As of ${new Date(generatedAt).toLocaleString()}`,
    );
  });

  it("says a stop run refused under its ceiling stopped before it, not that it reached it", async () => {
    stubPage({
      "usage.summary": {
        ok: true,
        result: {
          available: true,
          generatedAt,
          usage: { inputTokens: 4000, outputTokens: 2000 },
          budget: {
            maxTokens: 10000,
            behavior: "stop",
            supported: true,
            tokensUsed: 6000,
            exceeded: true,
          },
        },
      },
    });

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    expect(metricTile(view, "Last run").hint).toBe(
      `Tokens in / out. Stopped before the budget ceiling. As of ${new Date(generatedAt).toLocaleString()}`,
    );
  });

  it("still reports where an estimated budget stopped, not silence", async () => {
    stubPage({
      "usage.summary": {
        ok: true,
        result: {
          available: true,
          generatedAt,
          usage: { inputTokens: 10, outputTokens: 20 },
          budget: {
            maxTokens: 1000,
            behavior: "stop",
            supported: false,
            tokensUsed: 994,
            exceeded: true,
          },
        },
      },
    });

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    expect(metricTile(view, "Last run").hint).toBe(
      `Tokens in / out. Stopped before the budget ceiling. As of ${new Date(generatedAt).toLocaleString()}`,
    );
  });

  it("reports within-budget for an estimated budget that never reached its ceiling", async () => {
    stubPage({
      "usage.summary": {
        ok: true,
        result: {
          available: true,
          generatedAt,
          budget: {
            maxTokens: 1000,
            behavior: "warn",
            supported: false,
            tokensUsed: 120,
            exceeded: false,
          },
        },
      },
    });

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    expect(metricTile(view, "Last run")).toMatchObject({
      value: "Not reported",
      hint: `Within budget. As of ${new Date(generatedAt).toLocaleString()}`,
    });
  });

  it("says so plainly when the provider reported no tokens and no budget was set", async () => {
    stubPage({ "usage.summary": { ok: true, result: { available: true, generatedAt } } });

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    expect(metricTile(view, "Last run")).toMatchObject({
      value: "Not reported",
      hint: `As of ${new Date(generatedAt).toLocaleString()}`,
    });
  });

  it("holds a placeholder line under the tiles while the diff loads", () => {
    stubPage({ "status.diff": PENDING });

    const view = render(<TranslationsPanel refreshToken={1} />);

    expect(view.query("span.h-5")).not.toBeNull();
  });

  it("drops the placeholder line once the diff has loaded", async () => {
    stubPage();

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    expect(view.query("span.h-5")).toBeNull();
  });
});

describe("TranslationsPanel review report", () => {
  it("copies the full loaded diff, not the on-screen view, to the clipboard", async () => {
    stubPage();
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    await clickAsync(view.getByText("header button", "Copy as review report"));

    expect(writeText).toHaveBeenCalledWith(buildReviewReportMarkdown(DEFAULT_LOCALES));
  });

  it("confirms a copy and reverts the label after the confirmation window", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      stubPage();
      const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
      const button = view.getByText("header button", "Copy as review report");

      await clickAsync(button);
      expect(button.textContent).toBe("Copied");

      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(button.textContent).toBe("Copy as review report");
    } finally {
      vi.useRealTimers();
    }
  });

  it("never confirms when the clipboard write is refused", async () => {
    stubPage();
    writeText.mockRejectedValueOnce(new Error("clipboard permission denied"));
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    const button = view.getByText("header button", "Copy as review report");

    await clickAsync(button);

    expect(button.textContent).toBe("Copy as review report");
  });
});

describe("TranslationsPanel locales section", () => {
  it("announces the coverage table while the status read is open", async () => {
    stubSyncedPage({ "status.check": PENDING });

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    const section = view.getByText("h2", "Locales").closest("section");

    expect(section?.querySelector('[role="status"]')?.textContent).toBe("Loading locale coverage…");
  });

  it("reports a failed status read in place of the coverage table", async () => {
    stubSyncedPage({ "status.check": rpcError("SOURCE_UNREADABLE", "no source file") });

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    expect(alertTexts(view)).toEqual(["The source locale file could not be found on disk."]);
  });

  it("keeps the last known coverage rows when a status re-read fails", async () => {
    stubSyncedPage({
      "status.check": answersInOrder([
        checkResult(IN_SYNC_ROWS),
        rpcError("METHOD_RATE_LIMITED", "slow down"),
      ]),
    });
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    view.rerender(<TranslationsPanel refreshToken={2} />);
    await flush();

    expect(alertTexts(view)).toEqual([
      "Showing the last known status. Studio is limiting how often this action can run. Wait a moment and try again.",
    ]);
    expect(coverageRows(view)).toHaveLength(2);
  });

  it("renders one coverage row per locale, with its percentage and key counts", async () => {
    stubPage();

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    expect(cellTexts(coverageRows(view)[0])).toEqual([
      "de",
      `80%${(8).toLocaleString()} / ${(10).toLocaleString()} keys`,
      "1",
      "1",
      "8",
    ]);
  });

  it("names the lock version next to the section heading", async () => {
    stubSyncedPage({ "lock.state": lockResult(3, []) });

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

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

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

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
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

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
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

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

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    expect(view.text()).toContain("No lock file yet.");
    expect(view.all("th").map((cell) => cell.textContent)).not.toContain("Lock");
  });

  it("reports a failed lock read under the coverage table", async () => {
    stubSyncedPage({ "lock.state": rpcError("LOCK_FILE_INVALID", "corrupt") });

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    expect(alertTexts(view)).toEqual([
      "The lock file is missing, corrupt, or at an unsupported version.",
    ]);
  });
});

describe("TranslationsPanel key explorer", () => {
  it("defaults to the key-by-locale grid, with no key filter", async () => {
    stubPage();

    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    expect(view.query('input[type="search"]')).toBeNull();
    expect(view.query('button[aria-label="app.title in de: missing"]')).not.toBeNull();
  });

  it("switches to the per-locale lists, which bring a key filter", async () => {
    stubPage();
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    await switchToList(view);

    expect(view.get('input[type="search"]').getAttribute("aria-label")).toBe(
      "Filter by key or translation text",
    );
    expect(view.all("details")).toHaveLength(2);
  });

  it("returns to the grid when the Grid tab is chosen again", async () => {
    stubPage();
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await switchToList(view);

    await clickAsync(view.getByText("button", "Grid"));

    expect(view.all("details")).toHaveLength(0);
  });

  it("lists a locale's missing, changed, and orphaned keys separately", async () => {
    stubPage({
      "status.diff": diffResult([
        localeDiff("de", {
          missing: ["app.title", "app.body"],
          changed: ["app.cta"],
          orphaned: ["app.legacy"],
        }),
      ]),
      "status.check": checkResult([{ locale: "de", missing: 2, stale: 1, upToDate: 7 }]),
    });
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    await switchToList(view);

    expect(view.all("h4").map((heading) => heading.textContent)).toEqual([
      "Missing(2)",
      "Changed(1)",
      "Orphaned(1)",
    ]);
    expect(view.all("details ul button").map((button) => button.textContent)).toEqual([
      "app.title",
      "app.body",
      "app.cta",
      "app.legacy",
    ]);
  });

  it("lists the keys a run would leave for a person under Protected, with a count", async () => {
    stubPage({
      "status.diff": diffResult([
        localeDiff("de", { changed: ["app.cta", "app.terms"], protected: ["app.terms"] }),
      ]),
      "status.check": checkResult([{ locale: "de", missing: 0, stale: 2, upToDate: 8 }]),
    });
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    await switchToList(view);

    expect(view.all("h4").map((heading) => heading.textContent)).toEqual([
      "Missing(0)",
      "Changed(2)",
      "Orphaned(0)",
      "Protected(1)",
    ]);
    expect(view.get("details summary").textContent).toContain("Protected 1");
  });

  it("narrows every list to the keys matching the filter, leaving out groups without a match", async () => {
    stubPage({
      "status.diff": diffResult([
        localeDiff("de", {
          missing: ["app.title", "app.body"],
          changed: ["app.cta"],
          orphaned: ["app.legacy"],
        }),
      ]),
      "status.check": checkResult([{ locale: "de", missing: 2, stale: 1, upToDate: 7 }]),
    });
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await switchToList(view);

    typeInto(filterInput(view), "cta");

    expect(view.all("h4").map((heading) => heading.textContent)).toEqual(["Changed(1)"]);
    expect(view.all("details ul button").map((button) => button.textContent)).toEqual(["app.cta"]);
    expect(view.get("[data-locale-summary]").textContent).toBe("Changed 1");
  });

  it("matches a query found only in a key's value, not its key name", async () => {
    stubPage({
      "status.diff": diffResult([localeDiff("de", { missing: ["app.title", "app.body"] })]),
      "status.check": checkResult([{ locale: "de", missing: 2, stale: 0, upToDate: 8 }]),
      "locale.values": {
        ok: true,
        result: [
          {
            locale: "de",
            values: {
              "app.title": { source: "Welcome" },
              "app.body": { source: "Please review your shipping address" },
            },
          },
        ],
      },
    });
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await switchToList(view);

    typeInto(filterInput(view), "shipping");

    expect(view.all("details ul button").map((button) => button.textContent)).toEqual(["app.body"]);
  });

  it("labels each listed key with the origin of its current value", async () => {
    stubPage({
      "status.diff": diffResult([localeDiff("de", { changed: ["app.title", "app.body"] })]),
      "status.check": checkResult([{ locale: "de", missing: 0, stale: 2, upToDate: 8 }]),
      "locale.values": {
        ok: true,
        result: [
          {
            locale: "de",
            values: {
              "app.title": {
                source: "Welcome",
                target: "Willkommen",
                provenance: { origin: "human", reviewState: "unreviewed" },
              },
              "app.body": { source: "Body", target: "Text" },
            },
          },
        ],
      },
    });
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await switchToList(view);

    expect(view.all("details ul button").map((button) => button.textContent)).toEqual([
      "app.title Origin: Human. Written by a person.",
      "app.body",
    ]);
  });

  it("labels only changed keys, not orphaned ones, matching the lock file's counts", async () => {
    stubPage({
      "status.diff": diffResult([localeDiff("de", { orphaned: ["app.old"] })]),
      "status.check": checkResult([{ locale: "de", missing: 0, stale: 0, upToDate: 10 }]),
      "locale.values": {
        ok: true,
        result: [
          {
            locale: "de",
            values: {
              "app.old": {
                target: "Veraltet",
                provenance: { origin: "unrecorded", reviewState: "unreviewed" },
              },
            },
          },
        ],
      },
    });
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await switchToList(view);

    expect(view.all("details ul button").map((button) => button.textContent)).toEqual(["app.old"]);
  });

  it("still matches a query found in the key name when no value matches", async () => {
    stubPage({
      "status.diff": diffResult([localeDiff("de", { missing: ["app.title", "app.body"] })]),
      "status.check": checkResult([{ locale: "de", missing: 2, stale: 0, upToDate: 8 }]),
      "locale.values": {
        ok: true,
        result: [
          {
            locale: "de",
            values: {
              "app.title": { source: "Welcome" },
              "app.body": { source: "Please review your shipping address" },
            },
          },
        ],
      },
    });
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await switchToList(view);

    typeInto(filterInput(view), "title");

    expect(view.all("details ul button").map((button) => button.textContent)).toEqual([
      "app.title",
    ]);
  });

  it("produces no false positive for a key whose value and name both miss the query", async () => {
    stubPage({
      "status.diff": diffResult([localeDiff("de", { missing: ["app.title", "app.body"] })]),
      "status.check": checkResult([{ locale: "de", missing: 2, stale: 0, upToDate: 8 }]),
      "locale.values": {
        ok: true,
        result: [
          {
            locale: "de",
            values: {
              "app.title": { source: "Welcome" },
              "app.body": { source: "Please review your shipping address" },
            },
          },
        ],
      },
    });
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await switchToList(view);

    typeInto(filterInput(view), "nothing matches this");

    expect(view.all("details ul button")).toHaveLength(0);
  });

  it("keeps the 500 cap correct when a value match, not a key match, pushes the total over it", async () => {
    const decoyKeys = Array.from({ length: MAX_RENDERED_KEYS }, (_, index) => `app.key${index}`);
    stubPage({
      "status.diff": diffResult([localeDiff("de", { missing: [...decoyKeys, "app.needle"] })]),
      "status.check": checkResult([
        { locale: "de", missing: decoyKeys.length + 1, stale: 0, upToDate: 0 },
      ]),
      "locale.values": {
        ok: true,
        result: [
          {
            locale: "de",
            values: { "app.needle": { source: "a very specific needle string" } },
          },
        ],
      },
    });
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await switchToList(view);

    typeInto(filterInput(view), "needle");

    expect(view.all("details ul button").map((button) => button.textContent)).toEqual([
      "app.needle",
    ]);
    expect(view.text()).not.toContain("refine the filter to see more");
  }, 15000);

  it("caps a long list and says how many keys it is hiding", async () => {
    const keys = Array.from({ length: MAX_RENDERED_KEYS + 1 }, (_, index) => `app.key${index}`);
    stubPage({
      "status.diff": answersInOrder([
        diffResult([localeDiff("de", { missing: ["app.title"] })]),
        diffResult([localeDiff("de", { missing: keys })]),
      ]),
      "status.check": checkResult([{ locale: "de", missing: keys.length, stale: 0, upToDate: 0 }]),
    });
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await switchToList(view);

    view.rerender(<TranslationsPanel refreshToken={2} />);
    await flush();

    expect(view.text()).toContain(
      `Showing ${MAX_RENDERED_KEYS} of ${keys.length}, refine the filter to see more.`,
    );
  }, 15000);

  it("keeps a right-to-left locale's section in the page direction, since it holds only UI text", async () => {
    stubPage({
      "status.diff": diffResult([
        localeDiff("ar-EG", { missing: ["app.title"] }),
        localeDiff("de", { missing: ["app.title"] }),
      ]),
      "status.check": checkResult([
        { locale: "ar-EG", missing: 1, stale: 0, upToDate: 9 },
        { locale: "de", missing: 1, stale: 0, upToDate: 9 },
      ]),
    });
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    await switchToList(view);

    expect(view.all("details")).toHaveLength(2);
    expect(view.all("details[dir], details [dir]")).toEqual([]);
  });

  it("summarizes a pending locale's drift on its always-visible row", async () => {
    stubPage({
      "status.diff": diffResult([
        localeDiff("de", { missing: ["app.title"], changed: ["app.body"] }),
        localeDiff("fr"),
      ]),
    });
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    await switchToList(view);

    expect(view.all("summary")[0]?.textContent).toBe(
      "dePending changesMissing 1Changed 1Orphaned 0",
    );
    const pair = view.get("[data-locale-summary] > span");
    expect(pair.firstElementChild?.className).toContain("text-muted-foreground");
    expect(pair.lastElementChild?.className).toContain("tabular-nums");
    expect(view.all("summary")[0]?.textContent).not.toContain("\u00b7");
  });

  it("marks a locale with nothing pending as up to date, with no drift counts", async () => {
    stubPage({
      "status.diff": diffResult([localeDiff("de", { missing: ["app.title"] }), localeDiff("fr")]),
    });
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    await switchToList(view);

    expect(view.all("summary")[1]?.textContent).toBe("frUp to date");
  });

  it("expands the locales with pending changes and leaves the rest collapsed", async () => {
    stubPage({
      "status.diff": diffResult([localeDiff("de", { missing: ["app.title"] }), localeDiff("fr")]),
    });
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    await switchToList(view);

    expect(view.all("details").map((section) => section.hasAttribute("open"))).toEqual([
      true,
      false,
    ]);
  });
});

describe("TranslationsPanel key overlays", () => {
  it("opens the key drawer for the key whose grid cell was activated", async () => {
    stubPage(drawerStubs());
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    await openKeyDrawer(view, "app.title", "de");

    expect(view.get('[role="dialog"]').getAttribute("aria-label")).toBe("Details for app.title");
  });

  it("opens the key drawer from the list view too", async () => {
    stubPage(drawerStubs());
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await switchToList(view);

    await clickAsync(view.getByText("details ul button", "app.body"));
    await flush();

    expect(view.get('[role="dialog"]').getAttribute("aria-label")).toBe("Details for app.body");
  });

  it("closes the key drawer again", async () => {
    stubPage(drawerStubs());
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await openKeyDrawer(view, "app.title", "de");

    await clickAsync(view.get('button[aria-label="Close details for app.title"]'));

    expect(view.query('[role="dialog"]')).toBeNull();
  });

  it("swaps the drawer for the entry editor rather than stacking both", async () => {
    stubPage(drawerStubs());
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await openKeyDrawer(view, "app.title", "de");

    await clickAsync(view.getByText("button", "Edit"));
    await flush();

    expect(view.all('[role="dialog"]').map((dialog) => dialog.getAttribute("aria-label"))).toEqual([
      "Edit app.title in de",
    ]);
  });

  it("returns to the drawer when the editor is closed", async () => {
    stubPage(drawerStubs());
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await openKeyDrawer(view, "app.title", "de");
    await clickAsync(view.getByText("button", "Edit"));
    await flush();

    await clickAsync(view.get('button[aria-label="Close the editor for app.title"]'));
    await flush();

    expect(view.get('[role="dialog"]').getAttribute("aria-label")).toBe("Details for app.title");
  });

  it("marks an accepted edit actioned for this session and returns to the drawer", async () => {
    stubPage({
      ...drawerStubs(),
      "translation.editEntry": { ok: true, result: { accepted: true, value: "Hallo" } },
    });
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await openKeyDrawer(view, "app.title", "de");
    await clickAsync(view.getByText("button", "Edit"));
    await flush();

    await clickAsync(view.getByText("button", "Save"));
    await flush();

    expect(reviewOverlayStore.isActioned({ locale: "de", key: "app.title" })).toBe(true);
    expect(view.get('[role="dialog"]').getAttribute("aria-label")).toBe("Details for app.title");
  });
});

function integrityEntry(key: string, matches: boolean) {
  return {
    key,
    hasPlaceholders: true,
    matches,
    missing: matches ? [] : ["{name}"],
    extra: [],
    icuValid: true,
    icuArmsMatch: true,
    icuArmDetails: [],
    markupMatches: true,
    markupDetails: [],
  };
}

const FILTER_LOCALES: readonly DiffLocale[] = [
  localeDiff("de", {
    missing: ["app.title"],
    changed: ["app.body", "app.cta"],
    protected: ["app.cta"],
  }),
  localeDiff("fr", { missing: ["app.title"], orphaned: ["app.legacy"] }),
];

function stubFilterPage(overrides: Stubs = {}): void {
  stubPage({
    "status.diff": diffResult(FILTER_LOCALES),
    "review.queue": {
      ok: true,
      result: {
        available: true,
        version: 1,
        generatedAt: "2026-05-04T10:15:00.000Z",
        locales: [
          {
            locale: "fr",
            status: "succeeded",
            needsReview: [{ key: "app.subtitle", reasons: ["EQUALS_SOURCE"] }],
          },
        ],
      },
    },
    "locale.integrity": {
      ok: true,
      result: {
        locales: [
          {
            locale: "de",
            entries: [integrityEntry("app.body", false), integrityEntry("app.cta", true)],
          },
          { locale: "fr", entries: [] },
        ],
      },
    },
    ...overrides,
  });
}

function statusToggle(view: RenderResult, status: string): HTMLButtonElement {
  return view.get(`[data-status-filter="${status}"]`) as HTMLButtonElement;
}

function listedSections(view: RenderResult): string[] {
  return view
    .all("details summary")
    .map((summary) => summary.textContent?.split(/Pending|Up to/)[0] ?? "");
}

function headings(view: RenderResult): string[] {
  return view.all("h4").map((heading) => heading.textContent ?? "");
}

describe("TranslationsPanel key filters", () => {
  it("counts every status across the locales, the review queue and integrity included", async () => {
    stubFilterPage();
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    await switchToList(view);
    await flush();

    expect(view.all("[data-status-filter]").map((toggle) => toggle.textContent)).toEqual([
      "Missing2",
      "Changed2",
      "Orphaned1",
      "Protected1",
      "Review queue1",
      "Integrity problems1",
    ]);
  });

  it("reads the review queue and the integrity report only once the list is shown", async () => {
    stubFilterPage();
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    expect(rpcCalls.some((call) => call.method === "locale.integrity")).toBe(false);

    await switchToList(view);

    expect(rpcCalls.filter((call) => call.method === "locale.integrity")).toEqual([
      { method: "locale.integrity", params: {} },
    ]);
    expect(rpcCalls.some((call) => call.method === "review.queue")).toBe(true);
  });

  it("lists the review queue and the integrity problems as their own groups", async () => {
    stubFilterPage();
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);

    await switchToList(view);
    await flush();

    expect(headings(view)).toEqual([
      "Missing(1)",
      "Changed(2)",
      "Orphaned(0)",
      "Protected(1)",
      "Integrity problems(1)",
      "Missing(1)",
      "Changed(0)",
      "Orphaned(1)",
      "Review queue(1)",
    ]);
  });

  it("leaves out an entry decided in this tab from the review queue group", async () => {
    stubFilterPage();
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await switchToList(view);
    await flush();

    act(() => {
      reviewOverlayStore.markActioned({ locale: "fr", key: "app.subtitle" });
    });

    expect(statusToggle(view, "review").textContent).toBe("Review queue0");
  });

  it("narrows the lists to the chosen statuses and hides a locale with none of them", async () => {
    stubFilterPage();
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await switchToList(view);
    await flush();

    await clickAsync(statusToggle(view, "integrity"));

    expect(statusToggle(view, "integrity").getAttribute("aria-pressed")).toBe("true");
    expect(listedSections(view)).toEqual(["de"]);
    expect(headings(view)).toEqual(["Integrity problems(1)"]);
    expect(
      view.all("details ul button").map((button) => button.querySelector("span span")?.textContent),
    ).toEqual(["app.body"]);
  });

  it("combines several statuses", async () => {
    stubFilterPage();
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await switchToList(view);
    await flush();

    await clickAsync(statusToggle(view, "orphaned"));
    await clickAsync(statusToggle(view, "review"));

    expect(listedSections(view)).toEqual(["fr"]);
    expect(headings(view)).toEqual(["Orphaned(1)", "Review queue(1)"]);
    expect(view.get("[data-locale-summary]").textContent).toBe("Orphaned 1Review queue 1");
  });

  it("narrows to one locale, counting only that locale", async () => {
    stubFilterPage();
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await switchToList(view);
    await flush();

    selectOption(view.get('select[aria-label="Filter by locale"]') as HTMLSelectElement, "fr");
    await flush();

    expect(listedSections(view)).toEqual(["fr"]);
    expect(statusToggle(view, "missing").textContent).toBe("Missing1");
    expect(statusToggle(view, "integrity").textContent).toBe("Integrity problems0");
  });

  it("applies the text filter inside the chosen statuses", async () => {
    stubFilterPage();
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await switchToList(view);
    await flush();

    await clickAsync(statusToggle(view, "changed"));
    typeInto(filterInput(view), "cta");

    expect(headings(view)).toEqual(["Changed(1)"]);
  });

  it("explains an empty result and clears the locale and statuses on request", async () => {
    stubFilterPage();
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await switchToList(view);
    await flush();
    selectOption(view.get('select[aria-label="Filter by locale"]') as HTMLSelectElement, "fr");
    await clickAsync(statusToggle(view, "integrity"));

    expect(view.text()).toContain("No locale has a key in the chosen states.");
    await clickAsync(view.getByText("button", "Clear filters"));

    expect(listedSections(view)).toEqual(["de", "fr"]);
    expect(statusToggle(view, "integrity").getAttribute("aria-pressed")).toBe("false");
  });

  it("shows the empty state for a search without hits, and clearing filters focuses the search", async () => {
    stubFilterPage();
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await switchToList(view);
    await flush();

    typeInto(filterInput(view), "no-such-text");

    expect(listedSections(view)).toEqual([]);
    expect(view.text()).toContain("No matching keys");
    expect(view.text()).toContain("matches the search");
    expect(view.all("[data-status-filter]").map((toggle) => toggle.textContent)).toEqual([
      "Missing0",
      "Changed0",
      "Orphaned0",
      "Protected0",
      "Review queue0",
      "Integrity problems0",
    ]);

    await clickAsync(view.getByText("button", "Clear filters"));

    expect(filterInput(view).value).toBe("");
    expect(document.activeElement).toBe(filterInput(view));
    expect(listedSections(view)).toEqual(["de", "fr"]);
  });

  it("counts only the keys the search matches on each status chip", async () => {
    stubFilterPage();
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await switchToList(view);
    await flush();

    typeInto(filterInput(view), "cta");

    expect(statusToggle(view, "changed").textContent).toBe("Changed1");
    expect(statusToggle(view, "missing").textContent).toBe("Missing0");
  });

  it("disables the review and integrity statuses while their reads fail", async () => {
    stubFilterPage({
      "review.queue": rpcError("QUEUE_UNREADABLE"),
      "locale.integrity": rpcError("LOCK_FILE_INVALID"),
    });
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await switchToList(view);
    await flush();

    expect(statusToggle(view, "review").disabled).toBe(true);
    expect(statusToggle(view, "integrity").disabled).toBe(true);
    expect(statusToggle(view, "missing").disabled).toBe(false);
  });

  it("opens the key drawer from an integrity problem", async () => {
    stubFilterPage({ "key.integrity": { ok: true, result: { locales: [] } } });
    const view = await renderAsync(<TranslationsPanel refreshToken={1} />);
    await switchToList(view);
    await flush();
    await clickAsync(statusToggle(view, "integrity"));

    await clickAsync(view.get("details ul button"));

    expect(view.get('[role="dialog"]').getAttribute("aria-label")).toBe("Details for app.body");
  });
});
