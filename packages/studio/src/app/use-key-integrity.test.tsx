// @vitest-environment jsdom
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { KeyIntegrityLocaleEntry } from "../client/integrity-pill.js";
import { flush, render, renderAsync, rpcCalls, rpcError, stubRpc } from "./test-support.js";
import { type KeyIntegrityState, useKeyIntegrity } from "./use-key-integrity.js";

vi.mock("./api.js", () => import("./test-support.js").then((module) => module.apiMock()));

const MATCHING: KeyIntegrityLocaleEntry = {
  locale: "de",
  hasPlaceholders: true,
  matches: true,
  missing: [],
  extra: [],
  icuValid: true,
  markupMatches: true,
  markupDetails: [],
};

const MISMATCHED: KeyIntegrityLocaleEntry = {
  locale: "fr",
  hasPlaceholders: true,
  matches: false,
  missing: ["{{name}}"],
  extra: ["{{nom}}"],
  icuValid: true,
  markupMatches: true,
  markupDetails: [],
};

function integrityAnswer(locales: readonly KeyIntegrityLocaleEntry[]): {
  readonly ok: true;
  readonly result: unknown;
} {
  return { ok: true, result: { locales } };
}

let seen: KeyIntegrityState = { kind: "loading" };

function Probe({
  entryKey,
  token,
}: {
  readonly entryKey: string;
  readonly token: number;
}): ReactNode {
  seen = useKeyIntegrity(entryKey, token);
  return <span data-testid="kind">{seen.kind}</span>;
}

function probe(entryKey: string, token: number): ReactNode {
  return <Probe entryKey={entryKey} token={token} />;
}

describe("useKeyIntegrity", () => {
  it("starts in the loading state before key.integrity answers", () => {
    stubRpc({ "key.integrity": () => new Promise(() => {}) });

    const view = render(probe("app.title", 1));

    expect(view.text()).toBe("loading");
  });

  it("exposes every locale entry the server returned for the key", async () => {
    stubRpc({ "key.integrity": integrityAnswer([MATCHING, MISMATCHED]) });

    const view = await renderAsync(probe("app.title", 1));

    expect(view.text()).toBe("loaded");
    expect(seen).toEqual({ kind: "loaded", locales: [MATCHING, MISMATCHED] });
  });

  it("scopes the read to the requested key alone", async () => {
    stubRpc({ "key.integrity": integrityAnswer([]) });

    await renderAsync(probe("checkout.total", 1));

    expect(rpcCalls).toEqual([{ method: "key.integrity", params: { key: "checkout.total" } }]);
  });

  it("surfaces the failure message, which is what the drawer renders", async () => {
    stubRpc({ "key.integrity": rpcError("KEY_NOT_FOUND", "no such key in the source file") });

    const view = await renderAsync(probe("app.title", 1));

    expect(view.text()).toBe("error");
    expect(seen).toEqual({ kind: "error", message: "no such key in the source file" });
  });

  it("re-reads for the newly opened key, and asks for that key", async () => {
    stubRpc({
      "key.integrity": (params) =>
        integrityAnswer(
          (params as { readonly key: string }).key === "app.title" ? [MATCHING] : [MISMATCHED],
        ),
    });

    const view = await renderAsync(probe("app.title", 1));
    view.rerender(probe("app.subtitle", 1));
    await flush();

    expect(seen).toEqual({ kind: "loaded", locales: [MISMATCHED] });
    expect(rpcCalls).toEqual([
      { method: "key.integrity", params: { key: "app.title" } },
      { method: "key.integrity", params: { key: "app.subtitle" } },
    ]);
  });

  it("falls back to loading while the read for a newly opened key is in flight", async () => {
    let call = 0;
    stubRpc({
      "key.integrity": () => {
        call += 1;
        return call === 1 ? integrityAnswer([MATCHING]) : new Promise<never>(() => {});
      },
    });

    const view = await renderAsync(probe("app.title", 1));
    view.rerender(probe("app.subtitle", 1));

    expect(view.text()).toBe("loading");
  });

  it("re-reads the same key when the refresh token changes after a write", async () => {
    let call = 0;
    stubRpc({
      "key.integrity": () => {
        call += 1;
        return integrityAnswer(call === 1 ? [MISMATCHED] : [MATCHING]);
      },
    });

    const view = await renderAsync(probe("app.title", 1));
    view.rerender(probe("app.title", 2));
    await flush();

    expect(seen).toEqual({ kind: "loaded", locales: [MATCHING] });
    expect(rpcCalls).toHaveLength(2);
  });

  it("ignores an answer that arrives after the caller unmounted", async () => {
    let answer: (() => void) | undefined;
    const pending = new Promise<{ readonly ok: true; readonly result: unknown }>((resolve) => {
      answer = () => {
        resolve(integrityAnswer([MATCHING]));
      };
    });
    stubRpc({ "key.integrity": () => pending });

    const view = await renderAsync(probe("app.title", 1));
    view.unmount();
    seen = { kind: "error", message: "untouched" };
    answer?.();
    await pending;
    await flush();

    expect(seen).toEqual({ kind: "error", message: "untouched" });
  });
});
