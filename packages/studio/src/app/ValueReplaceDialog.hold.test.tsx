// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { click, clickAsync, flush, render, stubRpc, typeInto } from "./test-support.js";
import { ValueReplaceDialog } from "./ValueReplaceDialog.js";

vi.mock("./api.js", () => import("./test-support.js").then((module) => module.apiMock()));

interface GuardLike {
  isDirty(): boolean;
  onBlock(proceed: () => Promise<void>): void;
}

const guards = vi.hoisted(() => ({
  installed: [] as unknown[],
  uninstalled: 0,
  unload: [] as boolean[],
  restored: 0,
}));

vi.mock("./route-guard.js", () => ({
  installRouteGuard: (guard: unknown) => {
    guards.installed.push(guard);
    return () => {
      guards.uninstalled += 1;
    };
  },
  restoreHeldRoute: () => {
    guards.restored += 1;
  },
  setUnloadWarning: (active: boolean) => {
    guards.unload.push(active);
  },
  hasHeldRoute: () => false,
  onHoldDropped: () => () => {},
}));

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

describe("ValueReplaceDialog while an apply runs", () => {
  it("treats the route as dirty and warns on unload until the result is shown", async () => {
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
              key: "a",
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
            outcomes: [{ locale: "de", key: "a", status: "applied", staleSource: false }],
            counts: {},
            localeFailures: [],
          },
        };
      },
    });
    const view = render(<ValueReplaceDialog locales={["de"]} onClose={vi.fn()} />);
    typeInto(view.get("[data-replace-find]") as HTMLInputElement, "x");
    await clickAsync(view.getByText("button", "Preview"));
    expect(guards.installed).toHaveLength(0);

    click(view.get("[data-replace-apply]"));
    await flush();
    expect(guards.installed).toHaveLength(1);
    expect(guards.unload).toEqual([true]);
    const guard = guards.installed[0] as GuardLike;
    expect(guard.isDirty()).toBe(true);

    guard.onBlock(() => Promise.resolve());
    await flush();
    expect(view.get("[data-replace-nav-held]").textContent).toContain("paused");

    release();
    await flush();
    expect(view.query("[data-replace-step='result']")).not.toBeNull();
    expect(guards.restored).toBeGreaterThan(0);
    expect(guards.uninstalled).toBe(1);
    expect(guards.unload).toEqual([true, false]);
    expect(view.query("[data-replace-nav-held]")).toBeNull();
  });
});
