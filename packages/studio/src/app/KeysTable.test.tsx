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
      selectedKey={null}
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

    expect(view.all("tbody button").map((cell) => cell.getAttribute("aria-label"))).toEqual([
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
  function tabStops(view: { all(selector: string): HTMLElement[] }): string[] {
    return view
      .all("tbody [data-row][tabindex='0']")
      .map((stop) => `${stop.dataset.row}:${stop.dataset.col}`);
  }

  it("starts with the first cell as the only tab stop", async () => {
    stubRpc(NO_COVERAGE);
    const view = await renderAsync(table());

    expect(tabStops(view)).toEqual(["0:0"]);
  });

  it("moves the tab stop to the cell that takes focus, and focus is on it", async () => {
    stubRpc(NO_COVERAGE);
    const view = await renderAsync(table({ locales: [DE, FR] }));
    const target = view.get('[data-key="b.changed"] [data-col="1"]');

    act(() => target.focus());

    expect(document.activeElement).toBe(target);
    expect(tabStops(view)).toEqual(["1:1"]);
  });

  it("keeps the tab stop where it was when focus lands on something that is not a cell", async () => {
    stubRpc(NO_COVERAGE);
    const view = await renderAsync(table({ locales: [DE, FR] }));
    act(() => view.get('[data-key="b.changed"] [data-col="1"]').focus());

    act(() => {
      view
        .get('[data-key="a.missing"] th')
        .dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    });

    expect(tabStops(view)).toEqual(["1:1"]);
  });

  it("scrolls a cell that takes focus fully into view, honouring the sticky column and header", async () => {
    stubRpc(NO_COVERAGE);
    const spy = vi.spyOn(Element.prototype, "scrollIntoView");
    const view = await renderAsync(table({ locales: [DE, FR] }));

    act(() => view.get('[data-key="b.changed"] [data-col="1"]').focus());

    expect(spy).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
    expect(spy.mock.instances.at(-1)).toBe(view.get('[data-key="b.changed"] [data-col="1"]'));
    spy.mockRestore();
  });

  it("moves focus with the arrow keys and to the cell the tab stop then names", async () => {
    stubRpc(NO_COVERAGE);
    const view = await renderAsync(table({ locales: [DE, FR] }));
    const first = view.get('[data-key="a.missing"] [data-col="0"]');
    act(() => first.focus());

    keyDownOn(first, "ArrowRight");
    expect(document.activeElement).toBe(view.get('[data-key="a.missing"] [data-col="1"]'));
    expect(tabStops(view)).toEqual(["0:1"]);

    keyDownOn(document.activeElement as Element, "ArrowDown");
    expect(tabStops(view)).toEqual(["1:1"]);
  });
});

describe("KeysTable selection", () => {
  it("marks the open key's row as selected and no other", async () => {
    stubRpc(NO_COVERAGE);
    const view = await renderAsync(table({ selectedKey: "b.changed" }));

    expect(
      view.all("tbody tr").map((row) => [row.dataset.key, row.getAttribute("aria-selected")]),
    ).toEqual([
      ["a.missing", "false"],
      ["b.changed", "true"],
      ["c.orphaned", "false"],
    ]);
    expect(view.get('[data-key="b.changed"]').hasAttribute("data-selected")).toBe(true);
  });

  it("marks the open key's row in the entries table too", async () => {
    stubRpc(NO_COVERAGE);
    const view = await renderAsync(table({ locale: "de", selectedKey: "a.missing" }));

    expect(view.get('[data-key="a.missing"]').getAttribute("aria-selected")).toBe("true");
  });
});

describe("KeysTable markers", () => {
  const held = keyStatusIndex([DE], {
    review: [{ locale: "de", key: "a.missing" }],
    integrity: [],
  });

  it("explains a marker with the words the cell already carries, in both tables", async () => {
    stubRpc(NO_COVERAGE);
    const matrix = await renderAsync(table({ index: held }));
    expect(matrix.get("[role='tooltip']").textContent).toBe("In the review queue");
    expect(matrix.get('[data-key="a.missing"] button').getAttribute("aria-label")).toBe(
      "a.missing in de: Missing, in the review queue",
    );
    matrix.unmount();

    const entries = await renderAsync(table({ index: held, locale: "de" }));
    expect(entries.get("[role='tooltip']").textContent).toBe("In the review queue");
    expect(entries.get('[data-key="a.missing"]').textContent).toContain(
      "Missing, in the review queue",
    );
  });

  it("opens the entries table's marker tooltip from keyboard focus on the key", async () => {
    stubRpc(NO_COVERAGE);
    const view = await renderAsync(table({ index: held, locale: "de" }));
    const key = view.get('[data-key="a.missing"] th button');

    act(() => {
      key.focus();
      key.dispatchEvent(new Event("focusin", { bubbles: true }));
    });

    const slot = view.get('[data-key="a.missing"] th [data-slot]');
    expect(slot.hasAttribute("data-open")).toBe(true);
    expect(slot.textContent).toBe("In the review queue");
  });

  it("keeps a marked cell the same width as an unmarked one, so the hit area matches", async () => {
    stubRpc(NO_COVERAGE);
    const view = await renderAsync(table({ index: held }));
    const marked = view.get('[data-key="a.missing"] button');

    expect(marked.parentElement?.className).toContain("w-full");
    expect(marked.className).toContain("w-full");
  });

  it("does not announce the marker words twice", async () => {
    stubRpc(NO_COVERAGE);
    const view = await renderAsync(table({ index: held }));
    const button = view.get('[data-key="a.missing"] button');

    expect(button.hasAttribute("aria-describedby")).toBe(false);
    expect(view.get("[role='tooltip']").getAttribute("aria-hidden")).toBe("true");
  });

  it("adds no tooltip to a cell without markers", async () => {
    stubRpc(NO_COVERAGE);
    const view = await renderAsync(table());

    expect(view.query("[role='tooltip']")).toBeNull();
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

  it("does not open the key when the click ended a text selection inside its row", async () => {
    stubRpc(NO_COVERAGE);
    const onSelectKey = vi.fn();
    const view = await renderAsync(table({ onSelectKey, locale: "de" }));
    const row = view.get('[data-key="a.missing"]');
    const range = document.createRange();
    range.selectNodeContents(row.querySelector("[data-source], td") as Node);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);

    act(() => (row.querySelector("td") as HTMLElement).click());
    expect(onSelectKey).not.toHaveBeenCalled();

    window.getSelection()?.removeAllRanges();
    act(() => (row.querySelector("td") as HTMLElement).click());
    expect(onSelectKey).toHaveBeenCalledWith("a.missing");
  });

  it("still opens the key when the selected text is in another row", async () => {
    stubRpc(NO_COVERAGE);
    const onSelectKey = vi.fn();
    const view = await renderAsync(table({ onSelectKey, locale: "de" }));
    const range = document.createRange();
    range.selectNodeContents(view.get('[data-key="b.changed"] td'));
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);

    act(() => view.get('[data-key="a.missing"] td').click());

    expect(onSelectKey).toHaveBeenCalledWith("a.missing");
    window.getSelection()?.removeAllRanges();
  });

  it("reads a click on a text node and a click on the table itself", async () => {
    stubRpc(NO_COVERAGE);
    const onSelectKey = vi.fn();
    const view = await renderAsync(table({ onSelectKey }));
    const text = view.get('[data-key="c.orphaned"] th span').firstChild as Node;

    act(() => {
      text.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    act(() => view.get("table").click());

    expect(onSelectKey.mock.calls).toEqual([["c.orphaned"]]);
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
