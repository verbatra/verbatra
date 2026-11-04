// @vitest-environment jsdom
import type { MouseEvent } from "react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "./test-support.js";
import { type RovingTable, useRovingTable } from "./use-roving-table.js";

function capture(onActivate: (key: string) => void): { current: RovingTable | null } {
  const holder: { current: RovingTable | null } = { current: null };
  function Probe(): null {
    holder.current = useRovingTable({ rowCount: 2, colCount: 2 }, onActivate);
    return null;
  }
  render(<Probe />);
  return holder;
}

function clickOn(holder: { current: RovingTable | null }, target: EventTarget): void {
  act(() => {
    holder.current?.tableProps.onClick({ target } as unknown as MouseEvent<HTMLTableElement>);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useRovingTable", () => {
  it("reads nothing from a text node that has no parent element", () => {
    const onActivate = vi.fn();
    const holder = capture(onActivate);

    clickOn(holder, document.createTextNode("detached"));

    expect(onActivate).not.toHaveBeenCalled();
  });

  it("opens the key when the browser has no selection object at all", () => {
    vi.spyOn(window, "getSelection").mockReturnValue(null);
    const onActivate = vi.fn();
    const holder = capture(onActivate);
    const row = document.createElement("tr");
    row.dataset.key = "a.key";
    const cell = row.appendChild(document.createElement("td"));

    clickOn(holder, cell);

    expect(onActivate).toHaveBeenCalledWith("a.key");
  });

  it("does not open the key when a selection reaches into the row from outside", () => {
    const onActivate = vi.fn();
    const holder = capture(onActivate);
    const outside = document.body.appendChild(document.createElement("p"));
    outside.textContent = "outside";
    const row = document.body.appendChild(document.createElement("tr"));
    row.dataset.key = "a.key";
    const cell = row.appendChild(document.createElement("td"));
    cell.textContent = "inside";
    const range = document.createRange();
    range.setStart(outside.firstChild as Node, 0);
    range.setEnd(cell.firstChild as Node, 3);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);

    clickOn(holder, cell);

    expect(onActivate).not.toHaveBeenCalled();
    window.getSelection()?.removeAllRanges();
    outside.remove();
    row.remove();
  });
});
