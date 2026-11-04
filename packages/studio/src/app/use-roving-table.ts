import type { FocusEvent, KeyboardEvent, MouseEvent } from "react";
import { useState } from "react";
import type { GridArrowKey, GridDimensions, GridPosition } from "../client/roving-tabindex.js";
import { clampGridPosition, moveGridFocus } from "../client/roving-tabindex.js";

const ARROW_KEYS: ReadonlySet<string> = new Set<GridArrowKey>([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
]);

function isArrowKey(key: string): key is GridArrowKey {
  return ARROW_KEYS.has(key);
}

export function elementOf(target: EventTarget): Element | null {
  if (target instanceof Element) {
    return target;
  }
  return target instanceof Node ? target.parentElement : null;
}

function stopOf(target: EventTarget): HTMLElement | null {
  return elementOf(target)?.closest<HTMLElement>("[data-row][data-col]") ?? null;
}

function positionOf(stop: HTMLElement): GridPosition {
  return { row: Number(stop.dataset.row), col: Number(stop.dataset.col) };
}

function keyOf(target: EventTarget): string | undefined {
  return elementOf(target)?.closest<HTMLElement>("[data-key]")?.dataset.key;
}

function selectsTextInRow(target: EventTarget): boolean {
  const selection = window.getSelection();
  const row = elementOf(target)?.closest("tr");
  if (selection === null || selection.isCollapsed || row === undefined || row === null) {
    return false;
  }
  return row.contains(selection.anchorNode) || row.contains(selection.focusNode);
}

export interface RovingTable {
  readonly tableProps: {
    readonly onKeyDown: (event: KeyboardEvent<HTMLTableElement>) => void;
    readonly onFocus: (event: FocusEvent<HTMLTableElement>) => void;
    readonly onClick: (event: MouseEvent<HTMLTableElement>) => void;
  };
  stopProps(
    row: number,
    col: number,
  ): {
    readonly tabIndex: 0 | -1;
    readonly "data-row": number;
    readonly "data-col": number;
  };
}

export function useRovingTable(
  dimensions: GridDimensions,
  onActivate: (key: string) => void,
): RovingTable {
  const [position, setPosition] = useState<GridPosition>({ row: 0, col: 0 });
  const current = clampGridPosition(position, dimensions);

  function activate(target: EventTarget): void {
    const key = keyOf(target);
    if (key !== undefined) {
      onActivate(key);
    }
  }

  function focusStop(table: HTMLTableElement, next: GridPosition): void {
    setPosition(next);
    for (const stop of table.querySelectorAll<HTMLElement>(
      `[data-row="${next.row}"][data-col="${next.col}"]`,
    )) {
      stop.focus();
    }
  }

  return {
    tableProps: {
      onKeyDown(event) {
        const stop = stopOf(event.target);
        if (stop === null) {
          return;
        }
        if (isArrowKey(event.key)) {
          event.preventDefault();
          focusStop(event.currentTarget, moveGridFocus(positionOf(stop), event.key, dimensions));
          return;
        }
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          activate(event.target);
        }
      },
      onFocus(event) {
        const stop = stopOf(event.target);
        if (stop !== null) {
          setPosition(positionOf(stop));
          stop.scrollIntoView({ block: "nearest", inline: "nearest" });
        }
      },
      onClick(event) {
        if (!selectsTextInRow(event.target)) {
          activate(event.target);
        }
      },
    },
    stopProps: (row, col) => ({
      tabIndex: current.row === row && current.col === col ? 0 : -1,
      "data-row": row,
      "data-col": col,
    }),
  };
}
