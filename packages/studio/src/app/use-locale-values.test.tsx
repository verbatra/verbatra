// @vitest-environment jsdom
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { LocaleValuesData } from "../client/locale-values.js";
import type { RefreshableView } from "../client/state.js";
import { flush, render, renderAsync, rpcCalls, rpcError, stubRpc } from "./test-support.js";
import { useLocaleValues } from "./use-locale-values.js";

vi.mock("./api.js", () => import("./test-support.js").then((module) => module.apiMock()));

const DATA: LocaleValuesData = [
  { locale: "de", values: { greeting: { source: "Hello", target: "Hallo" } } },
];

const OTHER_DATA: LocaleValuesData = [
  { locale: "de", values: { greeting: { source: "Hi", target: "Hi" } } },
];

function valuesAnswer(result: LocaleValuesData): { readonly ok: true; readonly result: unknown } {
  return { ok: true, result };
}

let seen: RefreshableView<LocaleValuesData> = { kind: "loading" };

function Probe({ token }: { readonly token?: number }): ReactNode {
  seen = useLocaleValues(token);
  return <span data-testid="kind">{seen.kind}</span>;
}

describe("useLocaleValues", () => {
  it("starts in the loading state before locale.values answers", () => {
    stubRpc({ "locale.values": () => new Promise(() => {}) });

    const view = render(<Probe />);

    expect(view.text()).toBe("loading");
  });

  it("exposes the fetched locale values on success", async () => {
    stubRpc({ "locale.values": valuesAnswer(DATA) });

    const view = await renderAsync(<Probe />);

    expect(view.text()).toBe("data");
    expect(seen).toEqual({ kind: "data", data: DATA, stale: false });
  });

  it("reads with no parameters", async () => {
    stubRpc({ "locale.values": valuesAnswer(DATA) });

    await renderAsync(<Probe />);

    expect(rpcCalls).toEqual([{ method: "locale.values", params: {} }]);
  });

  it("renders a hard error when the very first read fails, since there is nothing to keep", async () => {
    stubRpc({ "locale.values": rpcError("INTERNAL", "boom") });

    const view = await renderAsync(<Probe />);

    expect(view.text()).toBe("error");
    expect(seen).toEqual({ kind: "error", error: { code: "INTERNAL", message: "boom" } });
  });

  it("replaces the data with the fresh read when the refresh token changes", async () => {
    let call = 0;
    stubRpc({
      "locale.values": () => {
        call += 1;
        return valuesAnswer(call === 1 ? DATA : OTHER_DATA);
      },
    });

    const view = await renderAsync(<Probe token={1} />);
    view.rerender(<Probe token={2} />);
    await flush();

    expect(seen).toEqual({ kind: "data", data: OTHER_DATA, stale: false });
    expect(rpcCalls).toHaveLength(2);
  });

  it("keeps the last good values and marks them stale when a re-read fails", async () => {
    let call = 0;
    stubRpc({
      "locale.values": () => {
        call += 1;
        return call === 1 ? valuesAnswer(DATA) : rpcError("INTERNAL", "broken");
      },
    });

    const view = await renderAsync(<Probe token={1} />);
    view.rerender(<Probe token={2} />);
    await flush();

    expect(view.text()).toBe("data");
    expect(seen).toEqual({
      kind: "data",
      data: DATA,
      stale: true,
      error: { code: "INTERNAL", message: "broken" },
    });
  });

  it("ignores an answer that arrives after the caller unmounted", async () => {
    let answer: (() => void) | undefined;
    const pending = new Promise<{ readonly ok: true; readonly result: unknown }>((resolve) => {
      answer = () => {
        resolve(valuesAnswer(DATA));
      };
    });
    stubRpc({ "locale.values": () => pending });

    const view = await renderAsync(<Probe />);
    view.unmount();
    seen = { kind: "loading" };
    answer?.();
    await pending;
    await flush();

    expect(seen).toEqual({ kind: "loading" });
  });
});
