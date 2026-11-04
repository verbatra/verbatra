import type { FocusEvent, KeyboardEvent, MouseEvent, RefObject } from "react";
import { useRef, useState } from "react";
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

function stopOf(target: EventTarget): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>("[data-row][data-col]") : null;
}

function positionOf(stop: HTMLElement): GridPosition {
  return { row: Number(stop.dataset.row), col: Number(stop.dataset.col) };
}

function keyOf(target: EventTarget): string | undefined {
  return target instanceof Element
    ? target.closest<HTMLElement>("[data-key]")?.dataset.key
    : undefined;
}

export interface RovingTable {
  readonly tableProps: {
    readonly ref: RefObject<HTMLTableElement | null>;
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
  const tableRef = useRef<HTMLTableElement | null>(null);
  const current = clampGridPosition(position, dimensions);

  function focusStop(next: GridPosition): void {
    setPosition(next);
    tableRef.current
      ?.querySelector<HTMLElement>(`[data-row="${next.row}"][data-col="${next.col}"]`)
      ?.focus();
  }

  return {
    tableProps: {
      ref: tableRef,
      onKeyDown(event) {
        const stop = stopOf(event.target);
        if (stop === null) {
          return;
        }
        if (isArrowKey(event.key)) {
          event.preventDefault();
          focusStop(moveGridFocus(positionOf(stop), event.key, dimensions));
          return;
        }
        const key = keyOf(event.target);
        if ((event.key === "Enter" || event.key === " ") && key !== undefined) {
          event.preventDefault();
          onActivate(key);
        }
      },
      onFocus(event) {
        const stop = stopOf(event.target);
        if (stop !== null) {
          setPosition(positionOf(stop));
        }
      },
      onClick(event) {
        const key = keyOf(event.target);
        if (key !== undefined) {
          onActivate(key);
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
