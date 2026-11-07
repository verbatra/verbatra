// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emitRefresh, render, rpcCalls, type StubRpcResult, stubRpc } from "./test-support.js";
import { type KeyHistoryRead, useKeyHistory } from "./use-key-history.js";

vi.mock("./api.js", () => import("./test-support.js").then((module) => module.apiMock()));

afterEach(() => {
  vi.useRealTimers();
});

let seen: KeyHistoryRead;

function Probe(props: {
  readonly enabled?: boolean;
  readonly locale?: string;
  readonly refreshToken?: number;
  readonly limit?: number;
}): ReactNode {
  seen = useKeyHistory({
    enabled: props.enabled ?? true,
    locale: props.locale ?? "de",
    keyName: "greeting",
    refreshToken: props.refreshToken ?? 0,
    limit: props.limit,
  });
  return null;
}

function answer(subject: string): StubRpcResult {
  return {
    ok: true,
    result: {
      available: true,
      revisions: [
        {
          commit: "a".repeat(40),
          authorDate: "2026-01-02T03:04:05+00:00",
          author: "Ada",
          subject,
          value: "v",
          sourceChanged: false,
          diff: [],
        },
      ],
      truncated: false,
      truncatedBy: [],
      unreadableRevisions: 0,
    },
  };
}

function reads(): number {
  return rpcCalls.filter((call) => call.method === "history.keyRevisions").length;
}

async function tick(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function lastSubject(): string | undefined {
  return seen.view.kind === "data" && seen.view.data.available
    ? seen.view.data.revisions[0]?.subject
    : undefined;
}

describe("useKeyHistory", () => {
  it("reads nothing while disabled and reads at once when enabled", async () => {
    vi.useFakeTimers();
    stubRpc({ "history.keyRevisions": answer("one") });
    const view = render(<Probe enabled={false} />);
    await tick(10);
    expect(reads()).toBe(0);

    view.rerender(<Probe enabled />);
    await tick(10);

    expect(reads()).toBe(1);
    expect(lastSubject()).toBe("one");
  });

  it("sends the limit only when one is asked for", async () => {
    vi.useFakeTimers();
    stubRpc({ "history.keyRevisions": answer("one") });
    const view = render(<Probe />);
    await tick(10);

    view.rerender(<Probe limit={200} />);
    await tick(10);

    expect(
      rpcCalls.filter((call) => call.method === "history.keyRevisions").map((c) => c.params),
    ).toEqual([
      { locale: "de", key: "greeting" },
      { locale: "de", key: "greeting", limit: 200 },
    ]);
  });

  it("survives seventy commits, one every 400 ms, without a burst of reads and ends on the newest answer", async () => {
    vi.useFakeTimers();
    let answers = 0;
    stubRpc({
      "history.keyRevisions": () => {
        answers += 1;
        return answer(`answer ${answers}`);
      },
    });
    render(<Probe />);
    await tick(10);

    for (let commit = 0; commit < 70; commit += 1) {
      emitRefresh({ reason: "git", at: "2026-01-01T00:00:00.000Z" });
      await tick(400);
    }
    await tick(2000);

    expect(reads()).toBeLessThanOrEqual(Math.ceil(28_000 / 1500) + 3);
    expect(reads()).toBeGreaterThan(5);
    expect(lastSubject()).toBe(`answer ${answers}`);
    expect(seen.view.kind === "data" && seen.view.stale).toBe(false);
  });

  it("recovers by itself after a rate limit answer and clears the stale notice", async () => {
    vi.useFakeTimers();
    let answers = 0;
    stubRpc({
      "history.keyRevisions": () => {
        answers += 1;
        if (answers === 2) {
          return {
            ok: false,
            error: { code: "METHOD_RATE_LIMITED", message: "slow", retryAfterSeconds: 3 },
          };
        }
        return answer(`answer ${answers}`);
      },
    });
    render(<Probe />);
    await tick(10);
    emitRefresh({ reason: "git", at: "2026-01-01T00:00:00.000Z" });
    await tick(1600);
    expect(seen.view.kind === "data" && seen.view.stale).toBe(true);

    await tick(3200);

    expect(seen.view.kind === "data" && seen.view.stale).toBe(false);
    expect(lastSubject()).toBe("answer 3");
  });

  it("drops an answer for a locale that is no longer asked for", async () => {
    vi.useFakeTimers();
    let release: (value: StubRpcResult) => void = () => {};
    stubRpc({
      "history.keyRevisions": (params) =>
        (params as { locale: string }).locale === "de"
          ? new Promise<StubRpcResult>((resolve) => {
              release = resolve;
            })
          : answer("french"),
    });
    const view = render(<Probe locale="de" />);
    await tick(10);

    view.rerender(<Probe locale="fr" />);
    await tick(10);
    await act(async () => {
      release(answer("german, late"));
      await vi.advanceTimersByTimeAsync(10);
    });

    expect(lastSubject()).toBe("french");
  });

  it("answers Retry with an immediate read", async () => {
    vi.useFakeTimers();
    let answers = 0;
    stubRpc({
      "history.keyRevisions": () => {
        answers += 1;
        return answers === 1
          ? { ok: false, error: { code: "INTERNAL", message: "boom" } }
          : answer("recovered");
      },
    });
    render(<Probe />);
    await tick(10);
    expect(seen.view.kind).toBe("error");

    act(() => seen.retry());
    await tick(10);

    expect(seen.retrying).toBe(false);
    expect(lastSubject()).toBe("recovered");
  });

  it("sets no retry timer once it was unmounted, even when a rate limit answer arrives late", async () => {
    vi.useFakeTimers();
    let release: (value: StubRpcResult) => void = () => {};
    stubRpc({
      "history.keyRevisions": () =>
        new Promise<StubRpcResult>((resolve) => {
          release = resolve;
        }),
    });
    const view = render(<Probe />);
    await tick(10);
    view.unmount();

    await act(async () => {
      release({
        ok: false,
        error: { code: "METHOD_RATE_LIMITED", message: "slow", retryAfterSeconds: 1 },
      });
      await vi.advanceTimersByTimeAsync(10);
    });
    await tick(5000);

    expect(reads()).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
