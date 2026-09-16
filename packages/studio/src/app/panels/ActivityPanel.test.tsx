// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { HistoryCommit, HistoryListResult } from "../../shared/rpc/history.js";
import type { UsageSummaryResult } from "../../shared/rpc/usage-summary.js";
import type { RenderResult } from "../test-support.js";
import { flush, render, renderAsync, rpcCalls, rpcError, stubRpc } from "../test-support.js";
import { ActivityPanel } from "./ActivityPanel.js";

vi.mock("../api.js", () => import("../test-support.js").then((module) => module.apiMock()));

const GENERATED_AT = "2026-05-04T10:15:00.000Z";

const COMMITS: readonly HistoryCommit[] = [
  {
    hash: "0f3ab19c7d5e4a2b",
    authorDate: "2026-05-04T09:00:00.000Z",
    subject: "chore: sync the German locale file",
    touchedPaths: ["locales/de.json", "locales/fr.json"],
  },
  {
    hash: "9c1de77a0b3f5511",
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

function stubActivity(
  usage: UsageSummaryResult,
  history: HistoryListResult = LOADED_HISTORY,
): void {
  stubRpc({ "usage.summary": usageAnswer(usage), "history.list": historyAnswer(history) });
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

describe("ActivityPanel", () => {
  it("names the page in its header", async () => {
    stubActivity(TRACKED_RUN);

    const view = await renderAsync(<ActivityPanel refreshToken={0} />);

    expect(view.get("h1").textContent).toBe("Activity");
    expect(view.getByText("p", "Reference")).toBeTruthy();
  });

  it("shows both panes as loading while the two reads are still open", () => {
    stubRpc({
      "usage.summary": () => new Promise(() => {}),
      "history.list": () => new Promise(() => {}),
    });

    const view = render(<ActivityPanel refreshToken={0} />);

    expect(view.all('[role="status"]').map((node) => node.textContent?.trim())).toEqual([
      "Loading...",
      "Loading...",
    ]);
  });

  it("reads the commit feed and the usage snapshot once each, with no parameters", async () => {
    stubActivity(TRACKED_RUN);

    await renderAsync(<ActivityPanel refreshToken={0} />);

    expect(rpcCalls).toEqual([
      { method: "usage.summary", params: {} },
      { method: "history.list", params: {} },
    ]);
  });

  it("re-reads both sources when the refresh token changes", async () => {
    stubActivity(TRACKED_RUN);

    const view = await renderAsync(<ActivityPanel refreshToken={0} />);
    view.rerender(<ActivityPanel refreshToken={1} />);
    await flush();

    expect(rpcCalls).toEqual([
      { method: "usage.summary", params: {} },
      { method: "history.list", params: {} },
      { method: "usage.summary", params: {} },
      { method: "history.list", params: {} },
    ]);
  });

  it("renders one feed row per commit, with the short hash and calendar date", async () => {
    stubActivity(TRACKED_RUN);

    const view = await renderAsync(<ActivityPanel refreshToken={0} />);
    const rows = view.all("ul.max-w-3xl > li");

    expect(rows).toHaveLength(2);
    expect(view.text()).toContain("chore: sync the German locale file");
    expect(view.text()).toContain("0f3ab19");
    expect(view.text()).toContain("2026-05-04");
  });

  it("lists the files a commit touched, and omits the list for a commit with none", async () => {
    stubActivity(TRACKED_RUN);

    const view = await renderAsync(<ActivityPanel refreshToken={0} />);
    const lists = view.all('ul[aria-label="Files changed"]');

    expect(lists).toHaveLength(1);
    expect(lists[0]?.textContent).toBe("locales/de.jsonlocales/fr.json");
  });

  it("renders the run's token totals as two tiles", async () => {
    stubActivity(TRACKED_RUN);

    const view = await renderAsync(<ActivityPanel refreshToken={0} />);

    expect(metricValue(view, "Input tokens")).toBe("640");
    expect(metricValue(view, "Output tokens")).toBe("128");
  });

  it("stamps the rail with the run's own timestamp, so it never reads as a live counter", async () => {
    stubActivity(TRACKED_RUN);

    const view = await renderAsync(<ActivityPanel refreshToken={0} />);

    expect(view.text()).toContain(`As of ${new Date(GENERATED_AT).toLocaleString()}`);
  });

  it("says tokens were not reported rather than showing a fabricated zero", async () => {
    stubActivity({ available: true, generatedAt: GENERATED_AT });

    const view = await renderAsync(<ActivityPanel refreshToken={0} />);

    expect(metricValue(view, "Tokens")).toBe("Not reported");
    expect(metricHint(view, "Tokens")).toBe("This provider does not report token usage.");
    expect(view.query("div[title='640']")).toBeNull();
  });

  it("renders a tracked budget as a meter plus a within-budget badge", async () => {
    stubActivity(TRACKED_RUN);

    const view = await renderAsync(<ActivityPanel refreshToken={0} />);
    const meter = metricCard(view, "Budget").querySelector<HTMLElement>('[style*="width"]');

    expect(metricValue(view, "Budget")).toBe("250 / 800");
    expect(metricHint(view, "Budget")).toBe("Behavior: warn");
    expect(meter?.style.width).toBe("31%");
    expect(meter?.className).toContain("bg-primary");
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

    const view = await renderAsync(<ActivityPanel refreshToken={0} />);
    const meter = metricCard(view, "Budget").querySelector<HTMLElement>('[style*="width"]');

    expect(meter?.style.width).toBe("100%");
    expect(meter?.className).toContain("bg-danger");
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

    const view = await renderAsync(<ActivityPanel refreshToken={0} />);

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

    const view = await renderAsync(<ActivityPanel refreshToken={0} />);
    const meter = metricCard(view, "Budget").querySelector<HTMLElement>('[style*="width"]');
    const status = metricCard(view, "Budget status");

    expect(meter?.style.width).toBe("60%");
    expect(meter?.className).toContain("bg-primary");
    expect(meter?.className).not.toContain("bg-danger");
    expect(status.textContent).toContain("Stopped before the ceiling");
    expect(status.textContent).not.toContain("Ceiling reached");
    expect(status.querySelector(".text-warning")).not.toBeNull();
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

    const view = await renderAsync(<ActivityPanel refreshToken={0} />);

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

    const view = await renderAsync(<ActivityPanel refreshToken={0} />);

    expect(metricHint(view, "Budget")).toBe("Behavior: stop");
  });

  it("renders no budget tile at all when the run had no budget configured", async () => {
    stubActivity({
      available: true,
      generatedAt: GENERATED_AT,
      usage: { inputTokens: 640, outputTokens: 128 },
    });

    const view = await renderAsync(<ActivityPanel refreshToken={0} />);

    expect(view.text()).not.toContain("Budget");
    expect(metricValue(view, "Input tokens")).toBe("640");
  });

  it("invites a first run when no usage snapshot has been recorded", async () => {
    stubActivity({ available: false });

    const view = await renderAsync(<ActivityPanel refreshToken={0} />);

    expect(view.text()).toContain("No run recorded yet");
    expect(view.text()).toContain("to record one.");
    expect(view.query('[role="alert"]')).toBeNull();
  });

  it("renders a first usage read that fails as a hard error, with no rail data", async () => {
    stubRpc({
      "usage.summary": rpcError("SNAPSHOT_UNREADABLE", "the run snapshot could not be read"),
      "history.list": historyAnswer(LOADED_HISTORY),
    });

    const view = await renderAsync(<ActivityPanel refreshToken={0} />);

    expect(alertText(view)).toBe("the run snapshot could not be read");
    expect(view.text()).not.toContain("Input tokens");
  });

  it("keeps the last good usage data, marked stale, when a re-fetch fails", async () => {
    let attempts = 0;
    stubRpc({
      "history.list": historyAnswer(LOADED_HISTORY),
      "usage.summary": () => {
        attempts += 1;
        return attempts === 1
          ? usageAnswer(TRACKED_RUN)
          : rpcError("SNAPSHOT_UNREADABLE", "the run snapshot could not be read");
      },
    });

    const view = await renderAsync(<ActivityPanel refreshToken={0} />);
    view.rerender(<ActivityPanel refreshToken={1} />);
    await flush();

    expect(alertText(view)).toBe(
      "Showing the last known usage. the run snapshot could not be read",
    );
    expect(metricValue(view, "Input tokens")).toBe("640");
  });

  it("renders history as unavailable, not an error, for a project without git", async () => {
    stubActivity(TRACKED_RUN, { available: false });

    const view = await renderAsync(<ActivityPanel refreshToken={0} />);

    expect(view.text()).toContain("History unavailable");
    expect(view.text()).toContain("This project is not a git repository, or git is not installed.");
    expect(view.query('[role="alert"]')).toBeNull();
  });

  it("explains an empty commit feed with the panel's own message", async () => {
    stubActivity(TRACKED_RUN, { available: true, commits: [] });

    const view = await renderAsync(<ActivityPanel refreshToken={0} />);

    expect(view.text()).toContain("No commits yet");
    expect(view.text()).toContain("No commit history yet for the source or target locale files.");
  });

  it("renders a failed history read as an error beside a healthy rail", async () => {
    stubRpc({
      "usage.summary": usageAnswer(TRACKED_RUN),
      "history.list": rpcError("INTERNAL"),
    });

    const view = await renderAsync(<ActivityPanel refreshToken={0} />);

    expect(alertText(view)).toBe(
      "An unexpected server error occurred. Check the terminal running Studio for details.",
    );
    expect(metricValue(view, "Input tokens")).toBe("640");
  });

  it("ignores answers that arrive after the panel unmounted", async () => {
    let answer: (() => void) | undefined;
    stubRpc({
      "history.list": historyAnswer(LOADED_HISTORY),
      "usage.summary": () =>
        new Promise((resolve) => {
          answer = () => {
            resolve(usageAnswer(TRACKED_RUN));
          };
        }),
    });

    const view = render(<ActivityPanel refreshToken={0} />);
    view.unmount();
    answer?.();
    await flush();

    expect(view.container.textContent).toBe("");
  });
});
