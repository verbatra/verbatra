// @vitest-environment jsdom
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { localeEntry, recordAt } from "../client/run-history-test-support.js";
import type { RunHistoryData } from "../client/run-history-view.js";
import type { RefreshableView } from "../client/state.js";
import { flush, render, renderAsync, rpcCalls, rpcError, stubRpc } from "./test-support.js";
import { useRunHistory } from "./use-run-history.js";

vi.mock("./api.js", () => import("./test-support.js").then((module) => module.apiMock()));

const ONE: RunHistoryData = {
  records: [recordAt("2026-07-01T00:00:00.000Z", { locales: [localeEntry("de")] })],
  total: 1,
  unreadableRecords: 0,
};

const TWO: RunHistoryData = {
  records: [recordAt("2026-07-02T00:00:00.000Z"), ...ONE.records],
  total: 2,
  unreadableRecords: 0,
};

let seen: RefreshableView<RunHistoryData> = { kind: "loading" };

function Probe({ token }: { readonly token?: number }): ReactNode {
  seen = useRunHistory(token);
  return <span>{seen.kind}</span>;
}

describe("useRunHistory", () => {
  it("is loading until usage.history answers", () => {
    stubRpc({ "usage.history": () => new Promise(() => {}) });

    expect(render(<Probe />).text()).toBe("loading");
  });

  it("asks for the newest thirty records and passes the answer through", async () => {
    stubRpc({ "usage.history": { ok: true, result: ONE } });

    await renderAsync(<Probe />);

    expect(rpcCalls).toEqual([{ method: "usage.history", params: { limit: 30 } }]);
    expect(seen).toEqual({ kind: "data", data: ONE, stale: false });
  });

  it("is a hard error when the first read fails", async () => {
    stubRpc({ "usage.history": rpcError("INTERNAL", "boom") });

    await renderAsync(<Probe />);

    expect(seen).toEqual({ kind: "error", error: { code: "INTERNAL", message: "boom" } });
  });

  it("re-reads on a new token, and keeps the last good history as stale when that fails", async () => {
    let call = 0;
    stubRpc({
      "usage.history": () => {
        call += 1;
        if (call === 1) {
          return { ok: true, result: ONE };
        }
        return call === 2 ? { ok: true, result: TWO } : rpcError("INTERNAL", "boom");
      },
    });

    const view = await renderAsync(<Probe token={1} />);
    view.rerender(<Probe token={2} />);
    await flush();
    expect(seen).toEqual({ kind: "data", data: TWO, stale: false });

    view.rerender(<Probe token={3} />);
    await flush();
    expect(seen).toEqual({
      kind: "data",
      data: TWO,
      stale: true,
      error: { code: "INTERNAL", message: "boom" },
    });
  });

  it("keeps the answer to the newest token when an older read answers last", async () => {
    const answers: ((result: RunHistoryData) => void)[] = [];
    stubRpc({
      "usage.history": () =>
        new Promise((resolve) => {
          answers.push((result) => resolve({ ok: true, result }));
        }),
    });

    const view = render(<Probe token={1} />);
    view.rerender(<Probe token={2} />);
    answers[1]?.(TWO);
    await flush();
    answers[0]?.(ONE);
    await flush();

    expect(answers).toHaveLength(2);
    expect(seen).toEqual({ kind: "data", data: TWO, stale: false });
  });

  it("ignores an answer that arrives after the caller unmounted", async () => {
    let answer: (() => void) | undefined;
    const pending = new Promise<{ readonly ok: true; readonly result: unknown }>((resolve) => {
      answer = () => resolve({ ok: true, result: ONE });
    });
    stubRpc({ "usage.history": () => pending });
    seen = { kind: "loading" };

    const view = render(<Probe />);
    view.unmount();
    answer?.();
    await flush();

    expect(seen).toEqual({ kind: "loading" });
  });
});
