import { childElements, type HastNode, isElement, textContent, visitParents } from "./hast";

export const STACKED_TABLE_CLASS = "vk-table-stack";
export const STACKED_TABLE_MIN_COLUMNS = 3;

function headerLabels(table: HastNode): string[] {
  const headerRow = childElements(table, "thead").flatMap((head) => childElements(head, "tr"))[0];
  if (headerRow === undefined) return [];
  return childElements(headerRow, "th").map((cell) => textContent(cell).trim());
}

function bodyRows(table: HastNode): HastNode[] {
  return childElements(table, "tbody").flatMap((body) => childElements(body, "tr"));
}

function withClass(node: HastNode, className: string): Record<string, unknown> {
  const current = node.properties?.className;
  const classes = Array.isArray(current) ? current : [];
  return { ...node.properties, className: [...classes, className] };
}

function stackTable(table: HastNode): void {
  const labels = headerLabels(table);
  if (labels.length < STACKED_TABLE_MIN_COLUMNS) return;
  table.properties = withClass(table, STACKED_TABLE_CLASS);
  for (const row of bodyRows(table)) {
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
