// @vitest-environment jsdom
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import type { DiffLocale } from "../client/diff-view.js";
import { type KeyStatusIndex, keyStatusIndex } from "../client/key-status-filter.js";
import type { LocaleValuesData } from "../client/locale-values.js";
import type { RpcResultFor } from "../shared/rpc/contract.js";
import { KeysTable, type KeysTableProps } from "./KeysTable.js";
import { flush, render, renderAsync, rpcError, stubRpc } from "./test-support.js";

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

type CheckRow = RpcResultFor<"status.check">["locales"][number];

function checkRow(locale: string, missing: number, stale: number, upToDate: number): CheckRow {
  return { locale, missing, stale, upToDate, inSync: missing === 0 && stale === 0 };
}

function checkResult(rows: readonly CheckRow[]): RpcResultFor<"status.check"> {
  return { inSync: rows.every((row) => row.inSync), locales: rows };
}

const DE = localeDiff("de", ["a.missing"], ["b.changed"], ["c.orphaned"]);
const FR = localeDiff("fr", [], []);
const NO_VALUES: LocaleValuesData = [];
const EMPTY_INDEX: KeyStatusIndex = keyStatusIndex([DE, FR], { review: [], integrity: [] });

function table(overrides: Partial<KeysTableProps> = {}) {
  return (
    <KeysTable
      locales={[DE]}
      keys={["a.missing", "b.changed", "c.orphaned"]}
      locale=""
      index={EMPTY_INDEX}
      localeValues={NO_VALUES}
      refreshToken={0}
      onSelectKey={vi.fn()}
      {...overrides}
    />
  );
}

function keyDownOn(element: Element, key: string): void {
  act(() => {
    element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
}

const NO_COVERAGE = { "status.check": { ok: true as const, result: checkResult([]) } };

describe("KeysTable coverage header", () => {
  it("shows a loading note per locale while the coverage call is still open", () => {
    stubRpc({ "status.check": () => new Promise(() => {}) });

    const view = render(table());

    expect(view.get("thead th:nth-child(3)").textContent).toBe("deLoading coverage");
  });

  it("marks coverage unavailable when the coverage call fails on the first load", async () => {
    stubRpc({ "status.check": rpcError("PROJECT_UNREADABLE", "the locale files are unreadable") });

    const view = await renderAsync(table());

    expect(view.get("thead th:nth-child(3)").textContent).toBe("deCoverage unavailable");
  });

  it("renders the completeness each locale's coverage row reports and keeps the note for a locale without one", async () => {
    stubRpc({ "status.check": { ok: true, result: checkResult([checkRow("de", 1, 0, 1)]) } });

    const view = await renderAsync(table({ locales: [DE, FR] }));

    expect(view.get("thead th:nth-child(3)").textContent).toBe("de50% up to date");
    expect(view.get("thead th:nth-child(4)").textContent).toBe("frLoading coverage");
    expect(view.get("thead span[aria-hidden] > span").style.width).toBe("50%");
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

    const view = await renderAsync(table());
    view.rerender(table({ refreshToken: 1 }));
    await flush();

    expect(view.get('[role="alert"]').textContent).toBe(
      "Showing the last known coverage. The lock file is missing, corrupt, or at an unsupported version.",
    );
    expect(view.get("thead th:nth-child(3)").textContent).toBe("de50% up to date");
  });

  it("carries no coverage in the entries table", async () => {
    stubRpc(NO_COVERAGE);

    const view = await renderAsync(table({ locale: "de" }));

    expect(view.text()).not.toContain("coverage");
  });
});

describe("KeysTable cells", () => {
  it("names every cell with its key, locale and status in words, so the status is never colour-only", async () => {
    stubRpc(NO_COVERAGE);

    const view = await renderAsync(table({ locales: [DE, FR] }));

    expect(view.all("tbody button").map((cell) => cell.textContent)).toEqual([
      "a.missing in de: Missing",
      "a.missing in fr: In sync",
      "b.changed in de: Changed",
      "b.changed in fr: In sync",
      "c.orphaned in de: Orphaned",
      "c.orphaned in fr: Absent",
    ]);
  });

  it("falls back to wording when a key has no source text and no translation", async () => {
    stubRpc(NO_COVERAGE);

    const matrix = await renderAsync(table());
    expect(matrix.get('[data-key="a.missing"]').textContent).toContain("No source text");
    matrix.unmount();

    const entries = await renderAsync(table({ locale: "de" }));
    expect(entries.get('[data-key="a.missing"]').textContent).toContain("No translation");
  });

  it("marks a key in a locale that does not list it as absent in the entries table", async () => {
    stubRpc(NO_COVERAGE);

    const view = await renderAsync(
      table({ locale: "fr", keys: ["c.orphaned"], locales: [DE, FR] }),
    );

    expect(view.get('[data-key="c.orphaned"]').textContent).toContain("Absent");
  });
});

describe("KeysTable focus", () => {
  it("keeps the roving position when focus lands on something that is not a cell", async () => {
    stubRpc(NO_COVERAGE);
    const view = await renderAsync(table());
    const tabStops = () =>
      view.all("tbody [data-row][tabindex='0']").map((stop) => stop.dataset.key);
    const before = view.all("tbody [data-row][tabindex='0']").length;

    act(() => {
      view
        .get('[data-key="b.changed"] th')
        .dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    });

    expect(before).toBe(1);
    expect(view.all("tbody [data-row][tabindex='0']")).toHaveLength(1);
    expect(tabStops()).toHaveLength(1);
  });
});

describe("KeysTable activation", () => {
  it("reports the row's key when a cell or the row is clicked", async () => {
    stubRpc(NO_COVERAGE);
    const onSelectKey = vi.fn();
    const view = await renderAsync(table({ onSelectKey }));

    act(() => view.get('[data-key="a.missing"] button').click());
    act(() => view.get('[data-key="c.orphaned"] th').click());
    act(() => view.get("thead th").click());

    expect(onSelectKey.mock.calls).toEqual([["a.missing"], ["c.orphaned"]]);
  });

  it("activates a cell with Enter and with Space and ignores other keys and non-cell targets", async () => {
    stubRpc(NO_COVERAGE);
    const onSelectKey = vi.fn();
    const view = await renderAsync(table({ onSelectKey }));

    keyDownOn(view.get('[data-key="a.missing"] button'), "Enter");
    keyDownOn(view.get('[data-key="c.orphaned"] button'), " ");
    keyDownOn(view.get('[data-key="b.changed"] button'), "x");
    keyDownOn(view.get('[data-key="b.changed"] th'), "Enter");

    expect(onSelectKey.mock.calls).toEqual([["a.missing"], ["c.orphaned"]]);
  });
});
