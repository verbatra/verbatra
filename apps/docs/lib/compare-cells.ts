import {
  type CompareCell,
  type CompareMark,
  type CompareRowId,
  type CompareSourceLink,
  type CompareTool,
  compareCell,
  verdictMark,
} from "./landing-compare";
import { MACHINE_PROVIDER_IDS, SUPPORTED_FORMAT_IDS } from "./landing-facts";

export type CellTranslator = {
  (key: string, values?: Record<string, string | number>): string;
  has(key: string): boolean;
};

export type CompareCellView = {
  readonly kind: CompareCell["kind"];
  readonly mark: CompareMark | null;
  readonly word: string;
  readonly note: string | null;
  readonly urls: ReadonlyArray<CompareSourceLink>;
};

function registryCount(row: CompareRowId, tool: CompareTool): Record<string, number> {
  if (tool !== "verbatra") return {};
  if (row === "providers") return { count: MACHINE_PROVIDER_IDS.length };
  if (row === "formats") return { count: SUPPORTED_FORMAT_IDS.length };
  return {};
}

function wordOf(
  t: CellTranslator,
  cell: CompareCell,
  row: CompareRowId,
  tool: CompareTool,
): string {
  if (cell.kind === "verdict") return t(`verdicts.${cell.verdict}`);
  if (cell.kind === "notApplicable") return t("verdicts.notApplicable");
  return t(`rows.${row}.${tool}.value`, registryCount(row, tool));
}

export function compareCellView(
  t: CellTranslator,
  row: CompareRowId,
  tool: CompareTool,
): CompareCellView {
  const cell = compareCell(row, tool);
  const noteKey = `rows.${row}.${tool}.note`;
  return {
    kind: cell.kind,
    mark: cell.kind === "verdict" ? verdictMark(cell.verdict) : null,
    word: wordOf(t, cell, row, tool),
    note: t.has(noteKey) ? t(noteKey) : null,
    urls: cell.urls,
  };
}

export function asCellTranslator(t: unknown): CellTranslator {
  return t as CellTranslator;
}
