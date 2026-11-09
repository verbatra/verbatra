// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  click,
  clickAsync,
  flush,
  render,
  rpcCalls,
  rpcError,
  settleHistory,
  stubRpc,
  typeInto,
} from "./test-support.js";
import { useRoute } from "./use-route.js";
import { ValueReplaceButton } from "./ValueReplaceButton.js";
import { ValueReplaceHost } from "./ValueReplaceHost.js";

vi.mock("./api.js", () => import("./test-support.js").then((module) => module.apiMock()));

const COUNTS = {
  ready: 1,
  "stale-source": 0,
  "gate-refused": 0,
  pinned: 0,
  protected: 0,
  "no-source-entry": 0,
  unchanged: 0,
  "too-long": 0,
};

function OtherPage(): null {
  return null;
}

function Shell({ tick, token = 0 }: { readonly tick: number; readonly token?: number }): ReactNode {
  const { page } = useRoute();
  return (
    <div data-tick={tick}>
      <main id="main" tabIndex={-1}>
        {page === "translations" ? (
          <ValueReplaceButton
            locales={["de", "fr", "es"]}
            draftKey={null}
            holdForDraft={() => false}
          />
        ) : (
          <OtherPage />
        )}
      </main>
      <ValueReplaceHost refreshToken={token} />
    </div>
  );
}

const PREVIEW = {
  ok: true,
  result: {
    entries: [
      {
        locale: "de",
        key: "greeting",
        status: "ready",
        valueHash: "h",
        before: "x",
        after: "y",
        excerptCut: false,
      },
    ],
    truncated: false,
    counts: COUNTS,
  },
} as const;

function stubApply(): () => void {
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  stubRpc({
    "translation.previewValueReplace": PREVIEW,
    "translation.applyValueReplace": async () => {
      await held;
      return {
        ok: true,
        result: {
          outcomes: [{ locale: "de", key: "greeting", status: "applied", staleSource: false }],
          counts: {},
          localeFailures: [],
        },
      };
    },
  });
  return release;
}

function goBack(): Promise<void> {
  act(() => {
    window.history.back();
  });
  return settleHistory();
}

function warningActive(): boolean {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

async function startApply(view: ReturnType<typeof render>): Promise<void> {
  await clickAsync(view.get("[data-value-replace-open]"));
  typeInto(view.get("[data-replace-find]") as HTMLInputElement, "x");
  await clickAsync(view.getByText("button", "Preview"));
  click(view.get("[data-replace-apply]"));
  await flush();
}

describe("the search and replace dialog across a route change", () => {
  it("keeps the per-entry result when Back is pressed while the apply runs and the app re-renders", async () => {
    window.history.replaceState({ idx: 0 }, "", "#/overview");
    window.history.pushState({ idx: 1 }, "", "#/translations");
    const release = stubApply();
    const view = render(<Shell tick={0} />);
    await flush();
    await startApply(view);

    await goBack();
    view.rerender(<Shell tick={1} />);
    await flush();
    expect(window.location.hash).toBe("#/overview");
    expect(view.query("[data-value-replace-open]")).toBeNull();

    release();
    await flush();
    view.rerender(<Shell tick={2} />);
    await flush();

    expect(view.query("[data-replace-step='result']")).not.toBeNull();
    expect(view.text()).toContain("greeting");
  });

  it("keeps the dialog open on its current step while the route changes underneath it", async () => {
    window.history.replaceState({ idx: 0 }, "", "#/overview");
    window.history.pushState({ idx: 1 }, "", "#/translations");
    stubApply();
    const view = render(<Shell tick={0} />);
    await flush();
    await clickAsync(view.get("[data-value-replace-open]"));

    await goBack();
    view.rerender(<Shell tick={1} />);
    await flush();

    expect(view.query("[data-value-replace-open]")).toBeNull();
    expect(view.query('[role="dialog"][aria-label="Search and replace"]')).not.toBeNull();
  });
});

describe("focus when the search and replace dialog closes", () => {
  it("returns to the button that opened it, though Find took focus first", async () => {
    window.history.replaceState({ idx: 0 }, "", "#/translations");
    stubApply();
    const view = render(<Shell tick={0} />);
    await flush();
    const opener = view.get("[data-value-replace-open]");
    await clickAsync(opener);
    expect(document.activeElement).toBe(view.get("[data-replace-find]"));

    click(view.get('[aria-label="Close search and replace"]'));
    await flush();

    expect(view.query('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("falls back to the main region when the opener left with a Back", async () => {
    window.history.replaceState({ idx: 0 }, "", "#/overview");
    window.history.pushState({ idx: 1 }, "", "#/translations");
    stubApply();
    const view = render(<Shell tick={0} />);
    await flush();
    await clickAsync(view.get("[data-value-replace-open]"));

    await goBack();
    view.rerender(<Shell tick={1} />);
    await flush();
    click(view.get('[aria-label="Close search and replace"]'));
    await flush();

    expect(view.query('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(view.get("#main"));
  });
});

describe("the locales the dialog searches", () => {
  it("sends no locale that a refresh removed while the dialog was open", async () => {
    window.history.replaceState({ idx: 0 }, "", "#/translations");
    stubRpc({
      "status.diff": {
        ok: true,
        result: {
          hasPendingChanges: false,
          locales: [{ locale: "de" }, { locale: "fr" }, { locale: "es" }],
        },
      },
      "translation.previewValueReplace": PREVIEW,
    });
    const view = render(<Shell tick={0} token={0} />);
    await flush();
    await clickAsync(view.get("[data-value-replace-open]"));
    await flush();
    expect(view.all("[data-replace-locale]")).toHaveLength(3);
    click(view.get('[data-replace-locale="de"]'));

    stubRpc({
      "status.diff": {
        ok: true,
        result: { hasPendingChanges: false, locales: [{ locale: "de" }, { locale: "fr" }] },
      },
    });
    view.rerender(<Shell tick={0} token={1} />);
    await flush();
    expect(view.all("[data-replace-locale]")).toHaveLength(2);

    typeInto(view.get("[data-replace-find]") as HTMLInputElement, "x");
    rpcCalls.length = 0;
    await clickAsync(view.getByText("button", "Preview"));

    expect(rpcCalls.at(-1)?.params).toEqual({
      find: "x",
      replace: "",
      caseSensitive: true,
      locales: ["fr"],
    });
  });
});

describe("the unload warning during an apply", () => {
  it("is on while the apply runs and off once it settles", async () => {
    window.history.replaceState({ idx: 0 }, "", "#/translations");
    const release = stubApply();
    const view = render(<Shell tick={0} />);
    await flush();
    await clickAsync(view.get("[data-value-replace-open]"));
    typeInto(view.get("[data-replace-find]") as HTMLInputElement, "x");
    await clickAsync(view.getByText("button", "Preview"));
    expect(warningActive()).toBe(false);

    click(view.get("[data-replace-apply]"));
    await flush();
    expect(warningActive()).toBe(true);

    release();
    await flush();
    expect(warningActive()).toBe(false);
  });

  it("goes off when the apply fails and the review step returns", async () => {
    window.history.replaceState({ idx: 0 }, "", "#/translations");
    stubRpc({
      "translation.previewValueReplace": PREVIEW,
      "translation.applyValueReplace": rpcError("INTERNAL_ERROR", "boom"),
    });
    const view = render(<Shell tick={0} />);
    await flush();
    await startApply(view);
    await flush();

    expect(view.query("[data-replace-step='review']")).not.toBeNull();
    expect(warningActive()).toBe(false);
  });

  it("goes off when the dialog unmounts during the apply", async () => {
    window.history.replaceState({ idx: 0 }, "", "#/translations");
    stubApply();
    const view = render(<Shell tick={0} />);
    await flush();
    await startApply(view);
    expect(warningActive()).toBe(true);

    view.unmount();

    expect(warningActive()).toBe(false);
  });
});
