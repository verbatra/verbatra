export type GridArrowKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

export interface GridPosition {
  readonly row: number;
  readonly col: number;
}

export interface GridDimensions {
  readonly rowCount: number;
  readonly colCount: number;
}

function wrapIndex(value: number, count: number): number {
  return ((value % count) + count) % count;
}

export function moveGridFocus(
  position: GridPosition,
  key: GridArrowKey,
  dimensions: GridDimensions,
): GridPosition {
  const { rowCount, colCount } = dimensions;
  if (rowCount <= 0 || colCount <= 0) {
    return position;
  }
  switch (key) {
    case "ArrowUp":
      return { row: wrapIndex(position.row - 1, rowCount), col: position.col };
    case "ArrowDown":
      return { row: wrapIndex(position.row + 1, rowCount), col: position.col };
    case "ArrowLeft":
      return { row: position.row, col: Math.max(0, position.col - 1) };
    case "ArrowRight":
      return { row: position.row, col: Math.min(colCount - 1, position.col + 1) };
  }
}

export function clampGridPosition(position: GridPosition, grid: GridDimensions): GridPosition {
  const row = Math.min(position.row, Math.max(0, grid.rowCount - 1));
  const col = Math.min(position.col, Math.max(0, grid.colCount - 1));
  if (row === position.row && col === position.col) {
    return position;
  }
  return { row, col };
}
