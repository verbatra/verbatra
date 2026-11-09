import { describe, expect, it, vi } from "vitest";
import type { RpcClient } from "./rpc-client.js";
import {
  createFocusRefresher,
  FOCUS_REFRESH_MIN_GAP_MS,
  refreshAfterRuns,
} from "./run-history-refresh.js";

function client(result: "ok" | "error" | "throw"): RpcClient {
  return {
    call: async () => {
      if (result === "throw") {
        throw new Error("boom");
      }
      return result === "ok"
        ? ({ ok: true, result: {} } as never)
        : ({ ok: false, error: { code: "X", message: "m" } } as never);
    },
  };
}

describe("refreshAfterRuns", () => {
  it.each([
    "translation.translatePending",
    "translation.retranslateEntry",
    "translation.retranslateEntries",
  ] as const)("asks for a re-read after %s returns, whatever it returned", async (method) => {
    for (const result of ["ok", "error"] as const) {
      const onReturned = vi.fn();
      const wrapped = refreshAfterRuns(client(result), onReturned);

      const response = await wrapped.call(method, {} as never);

      expect(response.ok).toBe(result === "ok");
      expect(onReturned).toHaveBeenCalledTimes(1);
    }
  });

  it("asks for a re-read even when the call itself throws, and rethrows", async () => {
    const onReturned = vi.fn();
    const wrapped = refreshAfterRuns(client("throw"), onReturned);

    await expect(wrapped.call("translation.translatePending", {} as never)).rejects.toThrow("boom");
    expect(onReturned).toHaveBeenCalledTimes(1);
  });

  it("stays quiet for every other method", async () => {
    const onReturned = vi.fn();
    const wrapped = refreshAfterRuns(client("ok"), onReturned);

    await wrapped.call("usage.history", {});
    await wrapped.call("review.queue", {} as never);
    await wrapped.call("translation.editEntry", {} as never);

    expect(onReturned).not.toHaveBeenCalled();
  });
});

describe("createFocusRefresher", () => {
  it("refreshes on return to a visible tab, at most once per gap", () => {
    const onRefresh = vi.fn();
    let clock = 10_000;
    const refresh = createFocusRefresher(onRefresh, { isVisible: () => true, now: () => clock });

    refresh();
    refresh();
    clock += FOCUS_REFRESH_MIN_GAP_MS - 1;
    refresh();
    clock += 1;
    refresh();

    expect(onRefresh).toHaveBeenCalledTimes(2);
  });

  it("does nothing while the tab is hidden", () => {
    const onRefresh = vi.fn();
    const refresh = createFocusRefresher(onRefresh, { isVisible: () => false, now: () => 0 });

    refresh();

    expect(onRefresh).not.toHaveBeenCalled();
  });
});
