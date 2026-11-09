// @vitest-environment jsdom
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  click,
  clickAsync,
  flush,
  render,
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

function Shell({ tick }: { readonly tick: number }): React.ReactNode {
  const { page } = useRoute();
  return (
    <div data-tick={tick}>
      {page === "translations" ? (
        <ValueReplaceButton locales={["de"]} draftKey={null} holdForDraft={() => false} />
      ) : (
        <OtherPage />
      )}
      <ValueReplaceHost />
    </div>
  );
}

function stubApply(): () => void {
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  stubRpc({
    "translation.previewValueReplace": {
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
    },
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

describe("the search and replace dialog across a route change", () => {
  it("keeps the per-entry result when Back is pressed while the apply runs and the app re-renders", async () => {
    window.history.replaceState({ idx: 0 }, "", "#/overview");
    window.history.pushState({ idx: 1 }, "", "#/translations");
    const release = stubApply();
    const view = render(<Shell tick={0} />);
    await flush();

    await clickAsync(view.get("[data-value-replace-open]"));
    typeInto(view.get("[data-replace-find]") as HTMLInputElement, "x");
    await clickAsync(view.getByText("button", "Preview"));
    click(view.get("[data-replace-apply]"));
    await flush();

    act(() => {
      window.history.back();
    });
    await settleHistory();
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

    act(() => {
      window.history.back();
    });
    await settleHistory();
    view.rerender(<Shell tick={1} />);
    await flush();

    expect(view.query("[data-value-replace-open]")).toBeNull();
    expect(view.query('[role="dialog"][aria-label="Search and replace"]')).not.toBeNull();
  });
});

describe("the unload warning during an apply", () => {
  it("is added when the apply starts and removed when it settles", async () => {
    window.history.replaceState({ idx: 0 }, "", "#/translations");
    const release = stubApply();
    const added: string[] = [];
    const removed: string[] = [];
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const view = render(<Shell tick={0} />);
    await flush();
    await clickAsync(view.get("[data-value-replace-open]"));
    typeInto(view.get("[data-replace-find]") as HTMLInputElement, "x");
    await clickAsync(view.getByText("button", "Preview"));

    const beforeApply = add.mock.calls.filter(([type]) => type === "beforeunload").length;
    expect(beforeApply).toBe(0);
    click(view.get("[data-replace-apply]"));
    await flush();

    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    for (const [type] of add.mock.calls) {
      added.push(String(type));
    }
    expect(added.filter((type) => type === "beforeunload")).toHaveLength(1);

    release();
    await flush();
    for (const [type] of remove.mock.calls) {
      removed.push(String(type));
    }
    expect(removed).toContain("beforeunload");
    const after = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
    add.mockRestore();
    remove.mockRestore();
  });
});
