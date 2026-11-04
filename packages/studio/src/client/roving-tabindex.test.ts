import { describe, expect, it } from "vitest";
import { clampGridPosition, type GridDimensions, moveGridFocus } from "./roving-tabindex.js";

const GRID: GridDimensions = { rowCount: 3, colCount: 4 };

describe("moveGridFocus", () => {
  it("moves up within bounds", () => {
    expect(moveGridFocus({ row: 1, col: 2 }, "ArrowUp", GRID)).toEqual({ row: 0, col: 2 });
  });

  it("wraps from the first row up to the last row", () => {
    expect(moveGridFocus({ row: 0, col: 2 }, "ArrowUp", GRID)).toEqual({ row: 2, col: 2 });
  });

  it("moves down within bounds", () => {
    expect(moveGridFocus({ row: 0, col: 2 }, "ArrowDown", GRID)).toEqual({ row: 1, col: 2 });
  });

  it("wraps from the last row down to the first row", () => {
    expect(moveGridFocus({ row: 2, col: 2 }, "ArrowDown", GRID)).toEqual({ row: 0, col: 2 });
  });

  it("moves left within bounds", () => {
    expect(moveGridFocus({ row: 1, col: 2 }, "ArrowLeft", GRID)).toEqual({ row: 1, col: 1 });
  });

  it("stops at the first column when moving left, instead of wrapping to the last", () => {
    expect(moveGridFocus({ row: 1, col: 0 }, "ArrowLeft", GRID)).toEqual({ row: 1, col: 0 });
  });

  it("moves right within bounds", () => {
    expect(moveGridFocus({ row: 1, col: 0 }, "ArrowRight", GRID)).toEqual({ row: 1, col: 1 });
  });

  it("stops at the last column when moving right, instead of wrapping to the first", () => {
    expect(moveGridFocus({ row: 1, col: 3 }, "ArrowRight", GRID)).toEqual({ row: 1, col: 3 });
  });

  it("wraps a single row onto itself when moving up or down", () => {
    const singleRow: GridDimensions = { rowCount: 1, colCount: 4 };
    expect(moveGridFocus({ row: 0, col: 1 }, "ArrowUp", singleRow)).toEqual({ row: 0, col: 1 });
    expect(moveGridFocus({ row: 0, col: 1 }, "ArrowDown", singleRow)).toEqual({ row: 0, col: 1 });
  });

  it("keeps a single column where it is when moving left or right", () => {
    const singleCol: GridDimensions = { rowCount: 3, colCount: 1 };
    expect(moveGridFocus({ row: 1, col: 0 }, "ArrowLeft", singleCol)).toEqual({ row: 1, col: 0 });
    expect(moveGridFocus({ row: 1, col: 0 }, "ArrowRight", singleCol)).toEqual({ row: 1, col: 0 });
  });

  it("returns the position unchanged when there are no rows", () => {
    const noRows: GridDimensions = { rowCount: 0, colCount: 4 };
    const position = { row: 0, col: 2 };
    expect(moveGridFocus(position, "ArrowDown", noRows)).toBe(position);
  });

  it("returns the position unchanged when there are no columns", () => {
    const noCols: GridDimensions = { rowCount: 3, colCount: 0 };
    const position = { row: 1, col: 0 };
    expect(moveGridFocus(position, "ArrowRight", noCols)).toBe(position);
  });

  it("returns the position unchanged when both rows and columns are zero", () => {
    const empty: GridDimensions = { rowCount: 0, colCount: 0 };
    const position = { row: 0, col: 0 };
    expect(moveGridFocus(position, "ArrowUp", empty)).toBe(position);
  });
});

describe("clampGridPosition", () => {
  it("returns the position unchanged while it fits the grid", () => {
    const position = { row: 2, col: 1 };
    expect(clampGridPosition(position, { rowCount: 5, colCount: 3 })).toBe(position);
  });

  it("clamps a row that a live refresh shrank away", () => {
    expect(clampGridPosition({ row: 4, col: 1 }, { rowCount: 2, colCount: 3 })).toEqual({
      row: 1,
      col: 1,
    });
  });

  it("clamps a column that a locale removal shrank away", () => {
    expect(clampGridPosition({ row: 0, col: 5 }, { rowCount: 2, colCount: 2 })).toEqual({
      row: 0,
      col: 1,
    });
  });

  it("clamps degenerate dimensions to the origin", () => {
    expect(clampGridPosition({ row: 3, col: 3 }, { rowCount: 0, colCount: 0 })).toEqual({
      row: 0,
      col: 0,
    });
  });
});
