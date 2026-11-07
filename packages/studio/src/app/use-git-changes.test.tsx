// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import type { StubRpcResult } from "./test-support.js";
import { flush, render, renderAsync, rpcCalls, rpcError, stubRpc } from "./test-support.js";
import type { GitChanges } from "./use-git-changes.js";
import { useGitChanges } from "./use-git-changes.js";

vi.mock("./api.js", () => import("./test-support.js").then((module) => module.apiMock()));

const STATUS: StubRpcResult = {
  ok: true,
  result: { available: true, branch: "main", files: [] },
};

function diffFor(key: string): StubRpcResult {
  return {
    ok: true,
    result: {
      available: true,
      path: "locales/x.json",
      state: "modified",
      added: [{ key, value: "v" }],
      removed: [],
      changed: [],
      truncated: false,
    },
  };
}

function setVisibility(state: "visible" | "hidden"): void {
  Object.defineProperty(document, "visibilityState", { configurable: true, value: state });
}

let seen: GitChanges;

function Probe({ token }: { readonly token: number }): ReactNode {
  seen = useGitChanges(token);
  return null;
}

describe("useGitChanges", () => {
  it("reads the status on mount and no diff until a locale is opened", async () => {
    stubRpc({ "git.status": STATUS });

    await renderAsync(<Probe token={0} />);

    expect(seen.status.kind).toBe("data");
    expect(seen.diff).toBeUndefined();
    expect(rpcCalls.map((call) => call.method)).toEqual(["git.status"]);
  });

  it("opens a locale, reads its diff by locale only, and closes it on the same toggle", async () => {
    stubRpc({ "git.status": STATUS, "git.localeDiff": diffFor("a") });
    await renderAsync(<Probe token={0} />);

    act(() => seen.toggle({ locale: "de", path: "locales/de.json", position: 0 }));
    await flush();

    expect(seen.open).toEqual({ locale: "de", path: "locales/de.json", position: 0 });
    expect(seen.diff?.kind).toBe("data");
    expect(rpcCalls.filter((call) => call.method === "git.localeDiff")).toEqual([
      { method: "git.localeDiff", params: { locale: "de" } },
    ]);

    act(() => seen.toggle({ locale: "de", path: "locales/de.json", position: 0 }));
    await flush();

    expect(seen.open).toBeUndefined();
    expect(seen.diff).toBeUndefined();
  });

  it("shows loading, not the previous locale's diff, when another locale opens", async () => {
    let call = 0;
    stubRpc({
      "git.status": STATUS,
      "git.localeDiff": () => {
        call += 1;
        return call === 1 ? diffFor("de-key") : new Promise<StubRpcResult>(() => {});
      },
    });
    await renderAsync(<Probe token={0} />);

    act(() => seen.toggle({ locale: "de", path: "locales/de.json", position: 0 }));
    await flush();
    act(() => seen.toggle({ locale: "fr", path: "locales/fr.json", position: 0 }));
    await flush();

    expect(seen.open?.locale).toBe("fr");
    expect(seen.diff).toEqual({ kind: "loading" });
  });

  it("shows loading again, not stale data, when a closed locale is reopened", async () => {
    let call = 0;
    stubRpc({
      "git.status": STATUS,
      "git.localeDiff": () => {
        call += 1;
        return call === 1 ? diffFor("first") : new Promise<StubRpcResult>(() => {});
      },
    });
    await renderAsync(<Probe token={0} />);
    const target = { locale: "de", path: "locales/de.json", position: 0 };

    act(() => seen.toggle(target));
    await flush();
    act(() => seen.toggle(target));
    await flush();
    act(() => seen.toggle(target));
    await flush();

    expect(seen.diff).toEqual({ kind: "loading" });
  });

  it("drops a diff answer for a locale that is no longer open", async () => {
    let answerDe: ((result: StubRpcResult) => void) | undefined;
    stubRpc({
      "git.status": STATUS,
      "git.localeDiff": (params) => {
        const { locale } = params as { locale: string };
        return locale === "de"
          ? new Promise<StubRpcResult>((resolve) => {
              answerDe = resolve;
            })
          : diffFor("fr-key");
      },
    });
    await renderAsync(<Probe token={0} />);

    act(() => seen.toggle({ locale: "de", path: "locales/de.json", position: 0 }));
    await flush();
    act(() => seen.toggle({ locale: "fr", path: "locales/fr.json", position: 0 }));
    await flush();
    answerDe?.(diffFor("de-key"));
    await flush();

    expect(seen.diff).toMatchObject({ kind: "data", data: { added: [{ key: "fr-key" }] } });
  });

  it("keeps the last diff, stale, when a re-read fails, and a status error when none was read", async () => {
    let call = 0;
    stubRpc({
      "git.status": STATUS,
      "git.localeDiff": () => {
        call += 1;
        return call === 1 ? diffFor("kept") : rpcError("INTERNAL", "boom");
      },
    });
    const view = await renderAsync(<Probe token={0} />);
    act(() => seen.toggle({ locale: "de", path: "locales/de.json", position: 0 }));
    await flush();

    view.rerender(<Probe token={1} />);
    await flush();

    expect(seen.diff).toMatchObject({
      kind: "data",
      stale: true,
      data: { added: [{ key: "kept" }] },
    });
  });

  it("returns a failed first status read as an error view", async () => {
    stubRpc({ "git.status": rpcError("INTERNAL", "boom") });

    render(<Probe token={0} />);
    await flush();

    expect(seen.status).toEqual({
      kind: "error",
      error: { code: "INTERNAL", message: "boom" },
    });
  });

  it("reads the status once for a burst of refreshes and once more after it", async () => {
    let answer: (() => void) | undefined;
    stubRpc({
      "git.status": () =>
        new Promise<StubRpcResult>((resolve) => {
          answer = () => resolve(STATUS);
        }),
    });
    const view = render(<Probe token={0} />);
    for (let token = 1; token <= 30; token += 1) {
      view.rerender(<Probe token={token} />);
    }
    await flush();
    expect(rpcCalls.filter((call) => call.method === "git.status")).toHaveLength(1);

    answer?.();
    await flush();
    await flush();

    expect(rpcCalls.filter((call) => call.method === "git.status")).toHaveLength(2);
    answer?.();
    await flush();
    expect(rpcCalls.filter((call) => call.method === "git.status")).toHaveLength(2);
  });

  it("reads the diff once for a burst of refreshes and never for a locale that closed", async () => {
    let answer: (() => void) | undefined;
    stubRpc({
      "git.status": STATUS,
      "git.localeDiff": () =>
        new Promise<StubRpcResult>((resolve) => {
          answer = () => resolve(diffFor("k"));
        }),
    });
    const view = await renderAsync(<Probe token={0} />);
    act(() => seen.toggle({ locale: "de", path: "locales/de.json", position: 0 }));
    await flush();
    for (let token = 1; token <= 20; token += 1) {
      view.rerender(<Probe token={token} />);
    }
    act(() => seen.toggle({ locale: "de", path: "locales/de.json", position: 0 }));
    await flush();

    answer?.();
    await flush();
    await flush();

    expect(rpcCalls.filter((call) => call.method === "git.localeDiff")).toHaveLength(1);
    expect(seen.diff).toBeUndefined();
  });

  it("reads again when the page becomes visible or the window gets focus, and only then", async () => {
    stubRpc({ "git.status": STATUS });
    await renderAsync(<Probe token={0} />);
    const statusCalls = (): number =>
      rpcCalls.filter((call) => call.method === "git.status").length;
    expect(statusCalls()).toBe(1);

    setVisibility("hidden");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await flush();
    expect(statusCalls()).toBe(1);

    setVisibility("visible");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await flush();
    await flush();
    expect(statusCalls()).toBe(2);

    const later = Date.now() + 1000;
    const clock = vi.spyOn(Date, "now").mockReturnValue(later);
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await flush();
    await flush();
    clock.mockRestore();
    expect(statusCalls()).toBe(3);
  });

  it("reads once when the page becomes visible and the window gets focus together", async () => {
    stubRpc({ "git.status": STATUS });
    await renderAsync(<Probe token={0} />);
    const statusCalls = (): number =>
      rpcCalls.filter((call) => call.method === "git.status").length;
    setVisibility("visible");

    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("focus"));
    });
    await flush();
    await flush();

    expect(statusCalls()).toBe(2);
  });

  it("stops listening for the page returning once it is unmounted", async () => {
    stubRpc({ "git.status": STATUS });
    const view = await renderAsync(<Probe token={0} />);
    view.unmount();

    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await flush();

    expect(rpcCalls.filter((call) => call.method === "git.status")).toHaveLength(1);
  });
});
