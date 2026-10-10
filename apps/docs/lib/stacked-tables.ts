import { childElements, type HastNode, isElement, textContent, visitParents } from "./hast";

export const STACKED_TABLE_CLASS = "vk-table-stack";
export const STACKED_TABLE_MIN_COLUMNS = 3;
export const WIDE_TABLE_CLASS = "vk-table-stack-wide";
export const WIDE_TABLE_MIN_COLUMNS = 6;
export const COMPACT_ROW_MAX_CHARACTERS = 48;

function headerLabels(table: HastNode): string[] {
  const headerRow = childElements(table, "thead").flatMap((head) => childElements(head, "tr"))[0];
  if (headerRow === undefined) return [];
  return childElements(headerRow, "th").map((cell) => textContent(cell).trim());
}

function bodyRows(table: HastNode): HastNode[] {
  return childElements(table, "tbody").flatMap((body) => childElements(body, "tr"));
}

function isCompact(rows: HastNode[]): boolean {
  return rows.every(
    (row) =>
      childElements(row, "td").reduce(
        (length, cell) => length + textContent(cell).trim().length,
        0,
      ) <= COMPACT_ROW_MAX_CHARACTERS,
  );
}

function withClass(node: HastNode, className: string): Record<string, unknown> {
  const current = node.properties?.className;
  const classes = Array.isArray(current) ? current : [];
  return { ...node.properties, className: [...classes, className] };
}

function stackTable(table: HastNode): void {
  const labels = headerLabels(table);
  const rows = bodyRows(table);
  if (labels.length < STACKED_TABLE_MIN_COLUMNS || isCompact(rows)) return;
  table.properties = withClass(table, STACKED_TABLE_CLASS);
  if (labels.length >= WIDE_TABLE_MIN_COLUMNS)
    table.properties = withClass(table, WIDE_TABLE_CLASS);
  for (const row of rows) {
    childElements(row, "td").forEach((cell, column) => {
      cell.properties = { ...cell.properties, dataLabel: labels[column] ?? "" };
    });
  }
}

function stackTablesIn(parent: HastNode): void {
  for (const child of parent.children ?? []) {
    if (isElement(child, "table")) stackTable(child);
  }
}

export function rehypeStackedTables() {
  return (tree: HastNode) => visitParents(tree, stackTablesIn);
}
