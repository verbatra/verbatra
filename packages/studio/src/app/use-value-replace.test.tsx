// @vitest-environment jsdom
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ReplaceCriteria } from "../client/value-replace.js";
import { flush, render, rpcCalls, stubRpc } from "./test-support.js";
import { useValueReplace, type ValueReplaceFlow } from "./use-value-replace.js";

vi.mock("./api.js", () => import("./test-support.js").then((module) => module.apiMock()));

const CRITERIA: ReplaceCriteria = {
  find: "x",
  replace: "y",
  caseSensitive: true,
  locales: ["de"],
};

const COUNTS = {
  ready: 0,
  "stale-source": 0,
  "gate-refused": 0,
  pinned: 0,
  protected: 0,
  "no-source-entry": 0,
  unchanged: 0,
  "too-long": 0,
};

function previewOf(status: "ready" | "pinned") {
  return {
    ok: true,
    result: {
      entries: [
        {
          locale: "de",
          key: "k",
          status,
          valueHash: "h",
          before: "x",
          after: "y",
          excerptCut: false,
        },
      ],
      truncated: false,
      counts: { ...COUNTS, [status]: 1 },
    },
  } as const;
}

const APPLIED = {
  ok: true,
  result: {
    outcomes: [{ locale: "de", key: "k", status: "applied", staleSource: false }],
    counts: {},
    localeFailures: [],
  },
} as const;

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function mountFlow(): { current: () => ValueReplaceFlow; unmount: () => void } {
  let latest: ValueReplaceFlow | null = null;
  function Probe(): null {
    latest = useValueReplace(["de"]);
    return null;
  }
  const view = render(<Probe />);
  return {
    current: () => {
      if (latest === null) {
        throw new Error("probe did not render");
      }
      return latest;
    },
    unmount: () => view.unmount(),
  };
}

function callsOf(method: string): number {
  return rpcCalls.filter((call) => call.method === method).length;
}

async function toReview(
  probe: ReturnType<typeof mountFlow>,
  status: "ready" | "pinned",
): Promise<void> {
  stubRpc({ "translation.previewValueReplace": previewOf(status) });
  act(() => probe.current().runPreview(CRITERIA));
  await flush();
}

describe("useValueReplace guards", () => {
  it("ignores a second preview while one is in flight", async () => {
    rpcCalls.length = 0;
    const gate = deferred<unknown>();
    stubRpc({ "translation.previewValueReplace": () => gate.promise as never });
    const probe = mountFlow();

    act(() => probe.current().runPreview(CRITERIA));
    act(() => probe.current().runPreview(CRITERIA));

    expect(callsOf("translation.previewValueReplace")).toBe(1);
    gate.resolve(previewOf("ready"));
    await flush();
    expect(probe.current().phase.kind).toBe("review");
  });

  it("changes no opt-in and sends no apply outside the review step", () => {
    rpcCalls.length = 0;
    const probe = mountFlow();

    act(() => probe.current().setOptIn("includePinned", true));
    act(() => probe.current().apply());

    expect(probe.current().phase.kind).toBe("criteria");
    expect(callsOf("translation.applyValueReplace")).toBe(0);
  });

  it("sends nothing when no previewed value may be sent", async () => {
    rpcCalls.length = 0;
    const probe = mountFlow();
    await toReview(probe, "pinned");

    act(() => probe.current().apply());
    await flush();

    expect(callsOf("translation.applyValueReplace")).toBe(0);
    expect(probe.current().phase.kind).toBe("review");
  });

  it("ignores a second apply, an opt-in change and Back while the apply is in flight", async () => {
    rpcCalls.length = 0;
    const gate = deferred<unknown>();
    const probe = mountFlow();
    await toReview(probe, "ready");
    stubRpc({ "translation.applyValueReplace": () => gate.promise as never });
    const staleFlow = probe.current();

    act(() => probe.current().apply());
    act(() => staleFlow.apply());
    act(() => probe.current().setOptIn("includePinned", true));
    act(() => probe.current().backToCriteria());

    expect(callsOf("translation.applyValueReplace")).toBe(1);
    const phase = probe.current().phase;
    expect(phase.kind).toBe("review");
    expect(phase.kind === "review" && phase.applying).toBe(true);
    expect(phase.kind === "review" && phase.optIns.includePinned).toBe(false);

    gate.resolve(APPLIED);
    await flush();
    expect(probe.current().phase.kind).toBe("result");
  });

  it("drops a preview answer that arrives after the owner unmounted", async () => {
    rpcCalls.length = 0;
    const gate = deferred<unknown>();
    stubRpc({ "translation.previewValueReplace": () => gate.promise as never });
    const probe = mountFlow();
    act(() => probe.current().runPreview(CRITERIA));

    probe.unmount();
    gate.resolve(previewOf("ready"));
    await flush();

    expect(callsOf("translation.previewValueReplace")).toBe(1);
  });

  it("drops an apply answer that arrives after the owner unmounted", async () => {
    rpcCalls.length = 0;
    const gate = deferred<unknown>();
    const probe = mountFlow();
    await toReview(probe, "ready");
    stubRpc({ "translation.applyValueReplace": () => gate.promise as never });
    act(() => probe.current().apply());

    probe.unmount();
    gate.resolve(APPLIED);
    await flush();

    expect(callsOf("translation.applyValueReplace")).toBe(1);
  });
});
