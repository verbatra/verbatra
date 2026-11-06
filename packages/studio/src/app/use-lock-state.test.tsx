// @vitest-environment jsdom
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { flush, render, renderAsync, rpcError, stubRpc } from "./test-support.js";
import { type LockView, useLockState } from "./use-lock-state.js";

vi.mock("./api.js", () => import("./test-support.js").then((module) => module.apiMock()));

let seen: LockView = { kind: "loading" };

function Probe({ token }: { readonly token: number }): ReactNode {
  seen = useLockState(token);
  return <span>{seen.kind}</span>;
}

const LOCKED = { ok: true, result: { exists: true, version: 3, locales: [] } } as const;

describe("useLockState", () => {
  it("starts loading, then reports the loaded lock", async () => {
    stubRpc({ "lock.state": LOCKED });

    const view = render(<Probe token={0} />);
    expect(view.text()).toBe("loading");
    await flush();

    expect(seen).toEqual({ kind: "loaded", version: 3, locales: [] });
  });

  it("reports a project without a lock file", async () => {
    stubRpc({ "lock.state": { ok: true, result: { exists: false } } });

    await renderAsync(<Probe token={0} />);

    expect(seen).toEqual({ kind: "no-lock" });
  });

  it("reports a first read that fails as an error", async () => {
    stubRpc({ "lock.state": rpcError("LOCK_FILE_INVALID", "bad") });

    await renderAsync(<Probe token={0} />);

    expect(seen).toEqual({ kind: "error", error: { code: "LOCK_FILE_INVALID", message: "bad" } });
  });

  it("keeps the last lock with a stale error when a re-read fails", async () => {
    let call = 0;
    stubRpc({
      "lock.state": () => {
        call += 1;
        return call === 1 ? LOCKED : rpcError("INTERNAL", "boom");
      },
    });

    const view = await renderAsync(<Probe token={0} />);
    view.rerender(<Probe token={1} />);
    await flush();

    expect(seen).toEqual({
      kind: "loaded",
      version: 3,
      locales: [],
      staleError: { code: "INTERNAL", message: "boom" },
    });
  });

  it("drops a no-lock reading for an error when the re-read fails", async () => {
    let call = 0;
    stubRpc({
      "lock.state": () => {
        call += 1;
        return call === 1 ? { ok: true, result: { exists: false } } : rpcError("INTERNAL", "boom");
      },
    });

    const view = await renderAsync(<Probe token={0} />);
    view.rerender(<Probe token={1} />);
    await flush();

    expect(seen.kind).toBe("error");
  });
});
