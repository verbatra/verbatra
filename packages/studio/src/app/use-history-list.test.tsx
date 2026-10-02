// @vitest-environment jsdom
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { HistoryCommit, HistoryListResult } from "../shared/rpc/history.js";
import { flush, render, renderAsync, rpcCalls, rpcError, stubRpc } from "./test-support.js";
import { type HistoryState, useHistoryList } from "./use-history-list.js";

vi.mock("./api.js", () => import("./test-support.js").then((module) => module.apiMock()));

const FIRST_COMMIT: HistoryCommit = {
  hash: "9f1c2ab",
  author: "Ada Lovelace",
  authorDate: "2026-05-01T09:12:00Z",
  subject: "Translate the onboarding strings",
  touchedPaths: ["locales/de.json"],
};

const SECOND_COMMIT: HistoryCommit = {
  hash: "3d4e5f6",
  author: "Ada Lovelace",
  authorDate: "2026-05-02T11:40:00Z",
  subject: "Add the French locale",
  touchedPaths: ["locales/fr.json", "locales/en.json"],
};

function historyAnswer(result: HistoryListResult): { readonly ok: true; readonly result: unknown } {
  return { ok: true, result };
}

let seen: HistoryState = { kind: "loading" };

function Probe({ token }: { readonly token?: number }): ReactNode {
  seen = useHistoryList(token);
  return <span data-testid="kind">{seen.kind}</span>;
}

describe("useHistoryList", () => {
  it("starts in the loading state before history.list answers", () => {
    stubRpc({ "history.list": () => new Promise(() => {}) });

    const view = render(<Probe />);

    expect(view.text()).toBe("loading");
  });

  it("exposes the commits the server returned, in the order it returned them", async () => {
    stubRpc({
      "history.list": historyAnswer({ available: true, commits: [FIRST_COMMIT, SECOND_COMMIT] }),
    });

    const view = await renderAsync(<Probe />);

    expect(view.text()).toBe("loaded");
    expect(seen).toEqual({ kind: "loaded", commits: [FIRST_COMMIT, SECOND_COMMIT] });
  });

  it("asks history.list for the whole history, with no limit of its own", async () => {
    stubRpc({ "history.list": historyAnswer({ available: true, commits: [] }) });

    await renderAsync(<Probe />);

    expect(rpcCalls).toEqual([{ method: "history.list", params: {} }]);
  });

  it("reports the unavailable state when the project is not a git repository", async () => {
    stubRpc({ "history.list": historyAnswer({ available: false, reason: "not-a-repository" }) });

    const view = await renderAsync(<Probe />);

    expect(view.text()).toBe("unavailable");
    expect(seen).toEqual({ kind: "unavailable", reason: "not-a-repository" });
  });

  it("carries the server's structured error through when the read fails", async () => {
    stubRpc({ "history.list": rpcError("HISTORY_READ_FAILED", "git is not installed") });

    const view = await renderAsync(<Probe />);

    expect(view.text()).toBe("error");
    expect(seen).toEqual({
      kind: "error",
      error: { code: "HISTORY_READ_FAILED", message: "git is not installed" },
    });
  });

  it("re-fetches when the refresh token changes, and shows the newer history", async () => {
    let call = 0;
    stubRpc({
      "history.list": () => {
        call += 1;
        return historyAnswer({
          available: true,
          commits: call === 1 ? [FIRST_COMMIT] : [FIRST_COMMIT, SECOND_COMMIT],
        });
      },
    });

    const view = await renderAsync(<Probe token={1} />);
    view.rerender(<Probe token={2} />);
    await flush();

    expect(seen).toEqual({ kind: "loaded", commits: [FIRST_COMMIT, SECOND_COMMIT] });
    expect(rpcCalls).toHaveLength(2);
  });

  it("keeps the loaded commits on screen while a re-fetch is still in flight", async () => {
    let call = 0;
    stubRpc({
      "history.list": () => {
        call += 1;
        return call === 1
          ? historyAnswer({ available: true, commits: [FIRST_COMMIT] })
          : new Promise<never>(() => {});
      },
    });

    const view = await renderAsync(<Probe token={1} />);
    view.rerender(<Probe token={2} />);
    await flush();

    expect(view.text()).toBe("loaded");
    expect(seen).toEqual({ kind: "loaded", commits: [FIRST_COMMIT] });
  });

  it("ignores an answer that arrives after the caller unmounted", async () => {
    let answer: (() => void) | undefined;
    const pending = new Promise<{ readonly ok: true; readonly result: unknown }>((resolve) => {
      answer = () => {
        resolve(historyAnswer({ available: true, commits: [FIRST_COMMIT] }));
      };
    });
    stubRpc({ "history.list": () => pending });

    const view = await renderAsync(<Probe />);
    view.unmount();
    seen = { kind: "loading" };
    answer?.();
    await pending;
    await flush();

    expect(seen).toEqual({ kind: "loading" });
  });
});
