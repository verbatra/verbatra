// @vitest-environment jsdom
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import type { DiffLocale } from "../client/diff-view.js";
import { MAX_RENDERED_KEYS } from "../client/filter.js";
import type { RpcResultFor } from "../shared/rpc/contract.js";
import { StatusGrid } from "./StatusGrid.js";
import { click, flush, render, renderAsync, rpcError, stubRpc } from "./test-support.js";

vi.mock("./api.js", () => import("./test-support.js").then((module) => module.apiMock()));

function localeDiff(
  locale: string,
  missing: readonly string[],
  changed: readonly string[],
  orphaned: readonly string[] = [],
): DiffLocale {
  return {
    locale,
    missing,
    changed,
    orphaned,
    hasPendingChanges: missing.length > 0 || changed.length > 0,
  };
}

function checkRow(
  locale: string,
  missing: number,
  stale: number,
  upToDate: number,
): RpcResultFor<"status.check">["locales"][number] {
  return { locale, missing, stale, upToDate, inSync: missing === 0 && stale === 0 };
}

function checkResult(
  rows: readonly RpcResultFor<"status.check">["locales"][number][],
): RpcResultFor<"status.check"> {
  return { inSync: rows.every((row) => row.inSync), locales: rows };
}

function keyDownOn(element: HTMLElement, key: string): void {
  act(() => {
    element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
}

const DE_DRIFT = localeDiff("de", ["a.missing"], ["b.changed"], ["c.orphaned"]);
const FR_CLEAN = localeDiff("fr", [], []);

function cellFor(view: { get(selector: string): HTMLElement }, label: string): HTMLElement {
  return view.get(`button[aria-label="${label}"]`);
}

describe("StatusGrid", () => {
  it("renders the empty state when no locale reports any drift", () => {
    stubRpc({ "status.check": { ok: true, result: checkResult([checkRow("de", 0, 0, 3)]) } });

    const view = render(
      <StatusGrid locales={[localeDiff("de", [], [])]} refreshToken={0} onSelectKey={vi.fn()} />,
    );

    expect(view.query("table")).toBeNull();
    expect(view.text()).toContain("No drift-affected keys to show.");
  });

  it("rows the union of drift keys, sorted, with one column per locale", async () => {
    stubRpc({ "status.check": { ok: true, result: checkResult([]) } });

    const view = await renderAsync(
      <StatusGrid locales={[DE_DRIFT, FR_CLEAN]} refreshToken={0} onSelectKey={vi.fn()} />,
    );

    expect(view.all("tbody th").map((cell) => cell.textContent)).toEqual([
      "a.missing",
      "b.changed",
      "c.orphaned",
    ]);
    expect(view.all("thead th").map((cell) => cell.textContent?.slice(0, 2))).toEqual([
      "Ke",
      "de",
      "fr",
    ]);
  });

  it("names every cell with its key, locale, and status, so the status is never color-only", async () => {
    stubRpc({ "status.check": { ok: true, result: checkResult([]) } });

    const view = await renderAsync(
      <StatusGrid locales={[DE_DRIFT, FR_CLEAN]} refreshToken={0} onSelectKey={vi.fn()} />,
    );

    expect(view.all("tbody button").map((cell) => cell.getAttribute("aria-label"))).toEqual([
      "a.missing in de: missing",
      "a.missing in fr: in-sync",
      "b.changed in de: changed",
      "b.changed in fr: in-sync",
      "c.orphaned in de: orphaned",
      "c.orphaned in fr: in-sync",
    ]);
  });

  it("labels each of the four cell states with its own word", async () => {
    stubRpc({ "status.check": { ok: true, result: checkResult([]) } });

    const view = await renderAsync(
      <StatusGrid locales={[DE_DRIFT, FR_CLEAN]} refreshToken={0} onSelectKey={vi.fn()} />,
    );

    expect(cellFor(view, "a.missing in de: missing").textContent).toBe("Missing");
    expect(cellFor(view, "b.changed in de: changed").textContent).toBe("Changed");
    expect(cellFor(view, "c.orphaned in de: orphaned").textContent).toBe("Orphaned");
    expect(cellFor(view, "a.missing in fr: in-sync").textContent).toBe("In sync");
  });

  it("shows a loading note per locale header while the coverage call is still open", () => {
    stubRpc({ "status.check": () => new Promise(() => {}) });

    const view = render(<StatusGrid locales={[DE_DRIFT]} refreshToken={0} onSelectKey={vi.fn()} />);

    expect(view.get("thead th:nth-child(2)").textContent).toBe("deLoading coverage");
  });

  it("marks coverage unavailable when the coverage call fails on the first load", async () => {
    stubRpc({ "status.check": rpcError("PROJECT_UNREADABLE", "the locale files are unreadable") });

    const view = await renderAsync(
      <StatusGrid locales={[DE_DRIFT]} refreshToken={0} onSelectKey={vi.fn()} />,
    );

    expect(view.get("thead th:nth-child(2)").textContent).toBe("deCoverage unavailable");
  });

  it("renders the completeness percentage each locale's coverage row reports", async () => {
    stubRpc({
      "status.check": {
        ok: true,
        result: checkResult([checkRow("de", 0, 0, 4), checkRow("fr", 1, 1, 2)]),
      },
    });

    const view = await renderAsync(
      <StatusGrid locales={[DE_DRIFT, FR_CLEAN]} refreshToken={0} onSelectKey={vi.fn()} />,
    );

    expect(view.get("thead th:nth-child(2)").textContent).toBe("de100% up to date");
    expect(view.get("thead th:nth-child(3)").textContent).toBe("fr50% up to date");
  });

  it("keeps the loading note for a locale the coverage result has no row for", async () => {
    stubRpc({ "status.check": { ok: true, result: checkResult([checkRow("de", 0, 0, 4)]) } });

    const view = await renderAsync(
      <StatusGrid locales={[DE_DRIFT, FR_CLEAN]} refreshToken={0} onSelectKey={vi.fn()} />,
    );

    expect(view.get("thead th:nth-child(3)").textContent).toBe("frLoading coverage");
  });

  it("draws the completeness bar at the reported percentage", async () => {
    stubRpc({ "status.check": { ok: true, result: checkResult([checkRow("de", 1, 0, 1)]) } });

    const view = await renderAsync(
      <StatusGrid locales={[DE_DRIFT]} refreshToken={0} onSelectKey={vi.fn()} />,
    );

    expect(view.get("thead span[aria-hidden] > span").style.width).toBe("50%");
  });

  it("re-reads coverage when the refresh token changes", async () => {
    let upToDate = 1;
    stubRpc({
      "status.check": () => ({ ok: true, result: checkResult([checkRow("de", 3, 0, upToDate)]) }),
    });

    const view = await renderAsync(
      <StatusGrid locales={[DE_DRIFT]} refreshToken={0} onSelectKey={vi.fn()} />,
    );
    expect(view.get("thead th:nth-child(2)").textContent).toBe("de25% up to date");

    upToDate = 3;
    view.rerender(<StatusGrid locales={[DE_DRIFT]} refreshToken={1} onSelectKey={vi.fn()} />);
    await flush();

    expect(view.get("thead th:nth-child(2)").textContent).toBe("de50% up to date");
  });

  it("marks coverage as last known when a re-read fails, without dropping the percentage", async () => {
    let call = 0;
    stubRpc({
      "status.check": () => {
        call += 1;
        return call === 1
          ? { ok: true, result: checkResult([checkRow("de", 1, 0, 1)]) }
          : rpcError("LOCK_FILE_INVALID", "lock file broken");
      },
    });

    const view = await renderAsync(
      <StatusGrid locales={[DE_DRIFT]} refreshToken={0} onSelectKey={vi.fn()} />,
    );
    view.rerender(<StatusGrid locales={[DE_DRIFT]} refreshToken={1} onSelectKey={vi.fn()} />);
    await flush();

    expect(view.get('[role="alert"]').textContent).toBe(
      "Showing the last known coverage. The lock file is missing, corrupt, or at an unsupported version.",
    );
    expect(view.get("thead th:nth-child(2)").textContent).toBe("de50% up to date");
  });

  it("reports the row's key when a cell is clicked", async () => {
    stubRpc({ "status.check": { ok: true, result: checkResult([]) } });
    const onSelectKey = vi.fn();

    const view = await renderAsync(
      <StatusGrid locales={[DE_DRIFT, FR_CLEAN]} refreshToken={0} onSelectKey={onSelectKey} />,
    );
    click(cellFor(view, "b.changed in fr: in-sync"));

    expect(onSelectKey).toHaveBeenCalledWith("b.changed");
  });

  it("activates a cell with Enter and with Space, so the grid is operable without a pointer", async () => {
    stubRpc({ "status.check": { ok: true, result: checkResult([]) } });
    const onSelectKey = vi.fn();

    const view = await renderAsync(
      <StatusGrid locales={[DE_DRIFT]} refreshToken={0} onSelectKey={onSelectKey} />,
    );
    keyDownOn(cellFor(view, "a.missing in de: missing"), "Enter");
    keyDownOn(cellFor(view, "c.orphaned in de: orphaned"), " ");

    expect(onSelectKey.mock.calls).toEqual([["a.missing"], ["c.orphaned"]]);
  });

  it("ignores a key that is neither an arrow nor an activation key", async () => {
    stubRpc({ "status.check": { ok: true, result: checkResult([]) } });
    const onSelectKey = vi.fn();

    const view = await renderAsync(
      <StatusGrid locales={[DE_DRIFT]} refreshToken={0} onSelectKey={onSelectKey} />,
    );
    keyDownOn(cellFor(view, "a.missing in de: missing"), "x");

    expect(onSelectKey).not.toHaveBeenCalled();
  });

  it("puts exactly the first cell in the Tab order on the first render", async () => {
    stubRpc({ "status.check": { ok: true, result: checkResult([]) } });

    const view = await renderAsync(
      <StatusGrid locales={[DE_DRIFT, FR_CLEAN]} refreshToken={0} onSelectKey={vi.fn()} />,
    );

    expect(view.all("tbody button").map((cell) => cell.getAttribute("tabindex"))).toEqual([
      "0",
      "-1",
      "-1",
      "-1",
      "-1",
      "-1",
    ]);
  });

  it("moves focus and the Tab order one column right on ArrowRight", async () => {
    stubRpc({ "status.check": { ok: true, result: checkResult([]) } });

    const view = await renderAsync(
      <StatusGrid locales={[DE_DRIFT, FR_CLEAN]} refreshToken={0} onSelectKey={vi.fn()} />,
    );
    keyDownOn(cellFor(view, "a.missing in de: missing"), "ArrowRight");

    const target = cellFor(view, "a.missing in fr: in-sync");
    expect(document.activeElement).toBe(target);
    expect(target.getAttribute("tabindex")).toBe("0");
  });

  it("wraps to the last column on ArrowLeft from the first column", async () => {
    stubRpc({ "status.check": { ok: true, result: checkResult([]) } });

    const view = await renderAsync(
      <StatusGrid locales={[DE_DRIFT, FR_CLEAN]} refreshToken={0} onSelectKey={vi.fn()} />,
    );
    keyDownOn(cellFor(view, "a.missing in de: missing"), "ArrowLeft");

    expect(document.activeElement).toBe(cellFor(view, "a.missing in fr: in-sync"));
  });

  it("moves one row down on ArrowDown and wraps to the last row on ArrowUp", async () => {
    stubRpc({ "status.check": { ok: true, result: checkResult([]) } });

    const view = await renderAsync(
      <StatusGrid locales={[DE_DRIFT]} refreshToken={0} onSelectKey={vi.fn()} />,
    );
    keyDownOn(cellFor(view, "a.missing in de: missing"), "ArrowDown");
    expect(document.activeElement).toBe(cellFor(view, "b.changed in de: changed"));

    keyDownOn(cellFor(view, "a.missing in de: missing"), "ArrowUp");
    expect(document.activeElement).toBe(cellFor(view, "c.orphaned in de: orphaned"));
  });

  it("adopts a cell that receives focus directly as the new roving position", async () => {
    stubRpc({ "status.check": { ok: true, result: checkResult([]) } });

    const view = await renderAsync(
      <StatusGrid locales={[DE_DRIFT, FR_CLEAN]} refreshToken={0} onSelectKey={vi.fn()} />,
    );
    const target = cellFor(view, "c.orphaned in fr: in-sync");
    act(() => {
      target.focus();
    });

    expect(target.getAttribute("tabindex")).toBe("0");
    expect(cellFor(view, "a.missing in de: missing").getAttribute("tabindex")).toBe("-1");
  });

  it("keeps one cell in the Tab order after the grid shrinks under the stored position", async () => {
    stubRpc({ "status.check": { ok: true, result: checkResult([]) } });

    const view = await renderAsync(
      <StatusGrid locales={[DE_DRIFT, FR_CLEAN]} refreshToken={0} onSelectKey={vi.fn()} />,
    );
    keyDownOn(cellFor(view, "a.missing in de: missing"), "ArrowUp");

    view.rerender(
      <StatusGrid
        locales={[localeDiff("de", ["a.missing"], [])]}
        refreshToken={0}
        onSelectKey={vi.fn()}
      />,
    );

    const inOrder = view.all("tbody button").filter((cell) => cell.tabIndex === 0);
    expect(inOrder).toHaveLength(1);
    expect(inOrder[0]?.getAttribute("aria-label")).toBe("a.missing in de: missing");
  });

  it("caps drift keys at the render limit and shows how many are hidden", async () => {
    stubRpc({ "status.check": { ok: true, result: checkResult([]) } });
    const missingKeys = Array.from(
      { length: MAX_RENDERED_KEYS + 1 },
      (_, index) => `app.key${index.toString().padStart(4, "0")}`,
    );

    const view = await renderAsync(
      <StatusGrid
        locales={[localeDiff("de", missingKeys, [])]}
        refreshToken={0}
        onSelectKey={vi.fn()}
      />,
    );

    expect(view.all("tbody tr")).toHaveLength(MAX_RENDERED_KEYS);
    expect(view.text()).toContain(
      `Showing the first ${MAX_RENDERED_KEYS} of ${missingKeys.length} keys. Switch to the List view to filter.`,
    );
  });

  it("does not show a truncation notice when drift keys are within the render limit", async () => {
    stubRpc({ "status.check": { ok: true, result: checkResult([]) } });

    const view = await renderAsync(
      <StatusGrid locales={[DE_DRIFT, FR_CLEAN]} refreshToken={0} onSelectKey={vi.fn()} />,
    );

    expect(view.text()).not.toContain("Switch to the List view to filter.");
  });

  it("renders a right-to-left locale's header and cells in its own direction", async () => {
    stubRpc({ "status.check": { ok: true, result: checkResult([]) } });

    const view = await renderAsync(
      <StatusGrid
        locales={[localeDiff("ar-EG", ["a.missing"], []), FR_CLEAN]}
        refreshToken={0}
        onSelectKey={vi.fn()}
      />,
    );

    expect(view.get("thead th:nth-child(2)").getAttribute("dir")).toBe("rtl");
    expect(view.get("thead th:nth-child(3)").getAttribute("dir")).toBeNull();
    expect(view.get("tbody td:nth-child(2)").getAttribute("dir")).toBe("rtl");
    expect(view.get("tbody td:nth-child(3)").getAttribute("dir")).toBeNull();
  });
});
