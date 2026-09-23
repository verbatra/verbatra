// @vitest-environment jsdom
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ReviewQueueData } from "../client/review-queue-data.js";
import type { RefreshableView } from "../client/state.js";
import { flush, render, renderAsync, rpcCalls, rpcError, stubRpc } from "./test-support.js";
import { useReviewQueue } from "./use-review-queue.js";

vi.mock("./api.js", () => import("./test-support.js").then((module) => module.apiMock()));

const FLAGGED: ReviewQueueData = {
  available: true,
  version: 1,
  generatedAt: "2026-05-01T09:12:00Z",
  locales: [
    {
      locale: "de",
      status: "succeeded",
      needsReview: [
        { key: "app.title", reasons: ["EQUALS_SOURCE"] },
        { key: "checkout.total", reasons: ["LENGTH_RATIO_OUTLIER", "GLOSSARY_TERM_MISSED"] },
      ],
    },
  ],
};

const CLEARED: ReviewQueueData = {
  available: true,
  version: 1,
  generatedAt: "2026-05-02T08:00:00Z",
  locales: [{ locale: "de", status: "succeeded", needsReview: [] }],
};

function queueAnswer(result: ReviewQueueData): { readonly ok: true; readonly result: unknown } {
  return { ok: true, result };
}

let seen: RefreshableView<ReviewQueueData> = { kind: "loading" };

function Probe({
  token,
  reload,
}: {
  readonly token?: number;
  readonly reload?: number;
}): ReactNode {
  seen = useReviewQueue(token, reload);
  return <span data-testid="kind">{seen.kind}</span>;
}

describe("useReviewQueue", () => {
  it("starts in the loading state before review.queue answers", () => {
    stubRpc({ "review.queue": () => new Promise(() => {}) });

    const view = render(<Probe />);

    expect(view.text()).toBe("loading");
  });

  it("passes the persisted snapshot through unchanged, so the caller flattens it itself", async () => {
    stubRpc({ "review.queue": queueAnswer(FLAGGED) });

    const view = await renderAsync(<Probe />);

    expect(view.text()).toBe("data");
    expect(seen).toEqual({ kind: "data", data: FLAGGED, stale: false });
  });

  it("treats a snapshot that was never written as data, not as an error", async () => {
    stubRpc({ "review.queue": queueAnswer({ available: false }) });

    const view = await renderAsync(<Probe />);

    expect(view.text()).toBe("data");
    expect(seen).toEqual({ kind: "data", data: { available: false }, stale: false });
  });

  it("reads the whole queue, which takes no parameters", async () => {
    stubRpc({ "review.queue": queueAnswer(FLAGGED) });

    await renderAsync(<Probe />);

    expect(rpcCalls).toEqual([{ method: "review.queue", params: {} }]);
  });

  it("renders a hard error when the very first read fails, since there is nothing to keep", async () => {
    stubRpc({ "review.queue": rpcError("SESSION_EXPIRED", "the session has expired") });

    const view = await renderAsync(<Probe />);

    expect(view.text()).toBe("error");
    expect(seen).toEqual({
      kind: "error",
      error: { code: "SESSION_EXPIRED", message: "the session has expired" },
    });
  });

  it("replaces the queue with the fresh read when the refresh token changes", async () => {
    let call = 0;
    stubRpc({
      "review.queue": () => {
        call += 1;
        return queueAnswer(call === 1 ? FLAGGED : CLEARED);
      },
    });

    const view = await renderAsync(<Probe token={1} />);
    view.rerender(<Probe token={2} />);
    await flush();

    expect(seen).toEqual({ kind: "data", data: CLEARED, stale: false });
    expect(rpcCalls).toHaveLength(2);
  });

  it("keeps the last good queue and marks it stale when a re-read fails", async () => {
    let call = 0;
    stubRpc({
      "review.queue": () => {
        call += 1;
        return call === 1 ? queueAnswer(FLAGGED) : rpcError("READ_FAILED", "snapshot unreadable");
      },
    });

    const view = await renderAsync(<Probe token={1} />);
    view.rerender(<Probe token={2} />);
    await flush();

    expect(view.text()).toBe("data");
    expect(seen).toEqual({
      kind: "data",
      data: FLAGGED,
      stale: true,
      error: { code: "READ_FAILED", message: "snapshot unreadable" },
    });
  });

  it("ignores an answer that arrives after the caller unmounted", async () => {
    let answer: (() => void) | undefined;
    const pending = new Promise<{ readonly ok: true; readonly result: unknown }>((resolve) => {
      answer = () => {
        resolve(queueAnswer(FLAGGED));
      };
    });
    stubRpc({ "review.queue": () => pending });

    const view = await renderAsync(<Probe />);
    view.unmount();
    seen = { kind: "loading" };
    answer?.();
    await pending;
    await flush();

    expect(seen).toEqual({ kind: "loading" });
  });

  it("re-fetches when the caller asks for a reload, without a refresh event", async () => {
    stubRpc({ "review.queue": queueAnswer(FLAGGED) });
    const view = await renderAsync(<Probe token={0} reload={0} />);
    stubRpc({ "review.queue": queueAnswer(CLEARED) });

    view.rerender(<Probe token={0} reload={1} />);
    await flush();

    expect(seen.kind === "data" && seen.data).toEqual(CLEARED);
  });
});
