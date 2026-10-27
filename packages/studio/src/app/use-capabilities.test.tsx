// @vitest-environment jsdom
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { StudioCapabilities } from "../shared/rpc/snapshot.js";
import { renderAsync, rpcCalls, rpcError, stubRpc } from "./test-support.js";
import { type CapabilitiesState, useCapabilities } from "./use-capabilities.js";

vi.mock("./api.js", () => import("./test-support.js").then((module) => module.apiMock()));

let seen: CapabilitiesState = { kind: "loading" };

function Probe(): ReactNode {
  seen = useCapabilities();
  return <span data-testid="kind">{seen.kind}</span>;
}

function snapshotResult(spend: boolean): { readonly ok: true; readonly result: unknown } {
  const capabilities: StudioCapabilities = { spend, writeToDisk: true };
  return { ok: true, result: { capabilities, sourceLocale: "en" } };
}

describe("useCapabilities", () => {
  it("starts in the loading state while the snapshot call is still open", async () => {
    stubRpc({ "project.snapshot": () => new Promise(() => {}) });

    const view = await renderAsync(<Probe />);

    expect(view.text()).toBe("loading");
    expect(seen.kind).toBe("loading");
  });

  it("exposes the server's resolved capabilities once the snapshot answers", async () => {
    stubRpc({ "project.snapshot": snapshotResult(true) });

    const view = await renderAsync(<Probe />);

    expect(view.text()).toBe("loaded");
    expect(seen).toStrictEqual({
      kind: "loaded",
      capabilities: { spend: true, writeToDisk: true },
      sourceLocale: "en",
    });
  });

  it("carries a refused spend capability through unchanged, so a caller can hide the affordance", async () => {
    stubRpc({ "project.snapshot": snapshotResult(false) });

    await renderAsync(<Probe />);

    expect(seen).toStrictEqual({
      kind: "loaded",
      capabilities: { spend: false, writeToDisk: true },
      sourceLocale: "en",
    });
  });

  it("reads capabilities from project.snapshot exactly once per mount", async () => {
    stubRpc({ "project.snapshot": snapshotResult(false) });

    await renderAsync(<Probe />);

    expect(rpcCalls).toEqual([{ method: "project.snapshot", params: {} }]);
  });

  it("reports an error state when the snapshot call fails", async () => {
    stubRpc({ "project.snapshot": rpcError("SESSION_EXPIRED", "the session has expired") });

    const view = await renderAsync(<Probe />);

    expect(view.text()).toBe("error");
  });

  it("ignores a call that resolves after the caller unmounted", async () => {
    let answer: (() => void) | undefined;
    stubRpc({
      "project.snapshot": () =>
        new Promise((resolve) => {
          answer = () => resolve(snapshotResult(true));
        }),
    });

    const view = await renderAsync(<Probe />);
    view.unmount();
    seen = { kind: "loading" };
    answer?.();
    await Promise.resolve();

    expect(seen.kind).toBe("loading");
  });
});
