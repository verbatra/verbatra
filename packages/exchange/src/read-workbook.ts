import ExcelJS from "exceljs";
import { ExchangeError } from "./errors.js";
import { unescapeFormulaLead } from "./formula-guard.js";
import { COLUMN, HEADER_ROW, HEADERS, INSTRUCTIONS_SHEET_NAME } from "./layout.js";
import { DEFAULT_WORKBOOK_LIMITS, type WorkbookLimits } from "./limits.js";
import { judgeRow, type RowAccumulator } from "./row-shape.js";
import type {
  WorkbookData,
  WorkbookDuplicateKey,
  WorkbookRowProblem,
  WorkbookSheet,
} from "./types.js";
import { guardWorkbookBytes } from "./zip-guard.js";

export interface ReadWorkbookOptions {
  readonly limits?: WorkbookLimits;
}

function cellString(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  /* v8 ignore next -- exceljs's Cell#text always returns Value#toString(), which is always a string; this fallback guards a case the public exceljs API cannot produce, kept only because the input is untrusted. */
  return typeof cell.text === "string" ? cell.text : "";
}

const FORMULA_GUARDED_COLUMNS: ReadonlySet<number> = new Set([
  COLUMN.source,
  COLUMN.current,
  COLUMN.translation,
  COLUMN.context,
]);

const LEGACY_HEADER_COLUMN_COUNT = COLUMN.sourceHash;

function assertHeader(sheet: ExcelJS.Worksheet): void {
  const header = sheet.getRow(HEADER_ROW);
  for (let column = 1; column <= LEGACY_HEADER_COLUMN_COUNT; column += 1) {
    const label = cellString(header.getCell(column));
    if (label !== HEADERS[column - 1]) {
      throw new ExchangeError(
        "WORKBOOK_INVALID",
        `The sheet "${sheet.name}" has an unexpected header label in column ${column} (expected "${HEADERS[column - 1]}").`,
      );
    }
  }
}

function sheetRowCells(row: ExcelJS.Row): readonly string[] {
  return HEADERS.map((_, index) => {
    const column = index + 1;
    const value = cellString(row.getCell(column));
    return FORMULA_GUARDED_COLUMNS.has(column) ? unescapeFormulaLead(value) : value;
  });
}

interface DataSheetRead {
  readonly sheet: WorkbookSheet;
  readonly malformed: readonly WorkbookRowProblem[];
  readonly duplicates: readonly WorkbookDuplicateKey[];
}

function assertRowCellCap(row: ExcelJS.Row, sheetName: string, limits: WorkbookLimits): void {
  if (row.cellCount > limits.maxCellsPerRow) {
    throw new ExchangeError(
      "WORKBOOK_INVALID",
      `The sheet "${sheetName}" has a row with more than the maximum of ${limits.maxCellsPerRow} cells.`,
    );
  }
}

function readDataSheet(sheet: ExcelJS.Worksheet, limits: WorkbookLimits): DataSheetRead {
  assertHeader(sheet);
  if (sheet.rowCount - HEADER_ROW > limits.maxRowsPerSheet) {
    throw new ExchangeError(
      "WORKBOOK_INVALID",
      `The sheet "${sheet.name}" has more than the maximum of ${limits.maxRowsPerSheet} rows.`,
    );
  }
  const into: RowAccumulator = {
    rows: [],
    malformed: [],
    duplicates: [],
    seenKeys: new Set<string>(),
  };
  for (let rowNumber = HEADER_ROW + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    assertRowCellCap(row, sheet.name, limits);
    judgeRow(sheetRowCells(row), sheet.name, { row: rowNumber }, into);
  }
  return {
    sheet: { locale: sheet.name, rows: into.rows },
    malformed: into.malformed,
    duplicates: into.duplicates,
  };
}

async function loadWorkbook(bytes: Uint8Array): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  try {
    const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    throw new ExchangeError("WORKBOOK_INVALID", "The workbook could not be parsed as xlsx.");
  }
  return workbook;
}

export async function readWorkbook(
  bytes: Uint8Array,
  options: ReadWorkbookOptions = {},
): Promise<WorkbookData> {
  const limits = options.limits ?? DEFAULT_WORKBOOK_LIMITS;
  await guardWorkbookBytes(bytes, limits);
  const workbook = await loadWorkbook(bytes);

  if (workbook.worksheets.length > limits.maxSheetCount) {
    throw new ExchangeError(
      "WORKBOOK_INVALID",
      `The workbook has more than the maximum of ${limits.maxSheetCount} sheets.`,
    );
  }

  const sheets: WorkbookSheet[] = [];
  const malformedRows: WorkbookRowProblem[] = [];
  const duplicateKeys: WorkbookDuplicateKey[] = [];
  for (const sheet of workbook.worksheets) {
    if (sheet.name === INSTRUCTIONS_SHEET_NAME) {
      continue;
    }
    const read = readDataSheet(sheet, limits);
    sheets.push(read.sheet);
    malformedRows.push(...read.malformed);
    duplicateKeys.push(...read.duplicates);
  }
  return { sheets, malformedRows, duplicateKeys };
}
