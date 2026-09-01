import ExcelJS from "exceljs";
import JSZip from "jszip";
import { ExchangeError } from "./errors.js";
import { escapeFormulaLead } from "./formula-guard.js";
import { INSTRUCTIONS_LINES } from "./instructions.js";
import { COLUMN, HEADER_ROW, HEADERS, INSTRUCTIONS_SHEET_NAME } from "./layout.js";
import type { WorkbookModel, WorkbookSheet } from "./types.js";

const READ_ONLY_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF1F3F5" },
};

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFDDE3EA" },
};

const COLUMN_WIDTHS: Readonly<Record<number, number>> = {
  [COLUMN.key]: 36,
  [COLUMN.source]: 50,
  [COLUMN.current]: 50,
  [COLUMN.status]: 12,
  [COLUMN.translation]: 50,
  [COLUMN.context]: 50,
  [COLUMN.reviewStatus]: 12,
  [COLUMN.reviewReasons]: 40,
};

const TEXT_NUMBER_FORMAT = "@";

function styleHeader(sheet: ExcelJS.Worksheet): void {
  const header = sheet.getRow(HEADER_ROW);
  HEADERS.forEach((label, index) => {
    const cell = header.getCell(index + 1);
    cell.value = label;
    cell.font = { bold: true };
    cell.fill = HEADER_FILL;
  });
  header.commit();
}

function applyColumnGeometry(sheet: ExcelJS.Worksheet): void {
  for (const [column, width] of Object.entries(COLUMN_WIDTHS)) {
    sheet.getColumn(Number(column)).width = width;
  }
  sheet.getColumn(COLUMN.sourceHash).hidden = true;
  sheet.getColumn(COLUMN.translation).numFmt = TEXT_NUMBER_FORMAT;
  sheet.views = [{ state: "frozen", ySplit: HEADER_ROW }];
}

function writeRow(sheet: ExcelJS.Worksheet, sheetRow: WorkbookSheet["rows"][number]): void {
  const row = sheet.addRow([]);
  row.getCell(COLUMN.key).value = sheetRow.key;
  row.getCell(COLUMN.source).value = escapeFormulaLead(sheetRow.source);
  row.getCell(COLUMN.current).value = escapeFormulaLead(sheetRow.currentTarget);
  row.getCell(COLUMN.status).value = sheetRow.status;
  const translationCell = row.getCell(COLUMN.translation);
  translationCell.numFmt = TEXT_NUMBER_FORMAT;
  const translation = escapeFormulaLead(sheetRow.translation);
  translationCell.value = translation === "" ? null : translation;
  row.getCell(COLUMN.sourceHash).value = sheetRow.sourceHash;
  row.getCell(COLUMN.context).value = escapeFormulaLead(sheetRow.context);
  row.getCell(COLUMN.reviewStatus).value = sheetRow.reviewStatus;
  row.getCell(COLUMN.reviewReasons).value = sheetRow.reviewReasons;

  for (let column: number = COLUMN.key; column <= COLUMN.reviewReasons; column += 1) {
    const cell = row.getCell(column);
    cell.protection = { locked: column !== COLUMN.translation };
    if (column !== COLUMN.translation) {
      cell.fill = READ_ONLY_FILL;
    }
  }
  row.commit();
}

const MAX_WORKSHEET_NAME_LENGTH = 31;
const FORBIDDEN_WORKSHEET_NAME_CHARS = /[:\\/?*[\]]/;

function assertValidWorksheetName(locale: string): void {
  if (locale.length === 0 || locale.length > MAX_WORKSHEET_NAME_LENGTH) {
    throw new ExchangeError(
      "WORKBOOK_INVALID",
      `The locale "${locale}" cannot be an Excel worksheet name: it must be 1 to ${MAX_WORKSHEET_NAME_LENGTH} characters.`,
    );
  }
  if (FORBIDDEN_WORKSHEET_NAME_CHARS.test(locale)) {
    throw new ExchangeError(
      "WORKBOOK_INVALID",
      `The locale "${locale}" cannot be an Excel worksheet name: it must not contain any of : \\ / ? * [ ].`,
    );
  }
}

function assertNoWorksheetNameCollisions(sheets: readonly WorkbookSheet[]): void {
  const reservedKey = INSTRUCTIONS_SHEET_NAME.toLowerCase();
  const seen = new Set<string>();
  for (const sheet of sheets) {
    const key = sheet.locale.toLowerCase();
    if (key === reservedKey) {
      throw new ExchangeError(
        "WORKBOOK_INVALID",
        `The locale "${sheet.locale}" cannot be an Excel worksheet name: it collides with the reserved "${INSTRUCTIONS_SHEET_NAME}" sheet.`,
      );
    }
    if (seen.has(key)) {
      throw new ExchangeError(
        "WORKBOOK_INVALID",
        `The locale "${sheet.locale}" cannot be an Excel worksheet name: it collides with another target locale's sheet name.`,
      );
    }
    seen.add(key);
  }
}

async function buildDataSheet(workbook: ExcelJS.Workbook, sheet: WorkbookSheet): Promise<void> {
  assertValidWorksheetName(sheet.locale);
  const worksheet = workbook.addWorksheet(sheet.locale);
  styleHeader(worksheet);
  for (const row of sheet.rows) {
    writeRow(worksheet, row);
  }
  applyColumnGeometry(worksheet);
  await worksheet.protect("", {
    spinCount: 0,
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatColumns: true,
    sort: true,
    autoFilter: true,
  });
}

function buildInstructionsSheet(workbook: ExcelJS.Workbook): void {
  const sheet = workbook.addWorksheet(INSTRUCTIONS_SHEET_NAME);
  sheet.getColumn(1).width = 110;
  for (const line of INSTRUCTIONS_LINES) {
    sheet.addRow([line]);
  }
  sheet.getRow(1).font = { bold: true };
}

const WORKBOOK_PROTECTION_XML = '<workbookProtection lockStructure="1" lockWindows="0"/>';

export function spliceWorkbookProtection(xml: string): string {
  const anchor = xml.includes("<bookViews") ? "<bookViews" : "<sheets";
  return xml.replace(anchor, `${WORKBOOK_PROTECTION_XML}${anchor}`);
}

async function protectWorkbookStructure(bytes: Uint8Array): Promise<Uint8Array> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new ExchangeError("WORKBOOK_INVALID", "The workbook could not be serialized.");
  }
  const workbookPart = zip.file("xl/workbook.xml");
  /* v8 ignore next 3 -- exceljs always writes xl/workbook.xml; this null guard is unreachable for any workbook this module builds. */
  if (workbookPart === null) {
    return bytes;
  }
  const xml = await workbookPart.async("string");
  zip.file("xl/workbook.xml", spliceWorkbookProtection(xml));
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

export async function buildWorkbook(model: WorkbookModel): Promise<Uint8Array> {
  assertNoWorksheetNameCollisions(model.sheets);
  const workbook = new ExcelJS.Workbook();
  buildInstructionsSheet(workbook);
  for (const sheet of model.sheets) {
    await buildDataSheet(workbook, sheet);
  }
  let serialized: Uint8Array;
  try {
    const buffer = await workbook.xlsx.writeBuffer();
    serialized = buffer as unknown as Uint8Array;
  } catch {
    throw new ExchangeError("WORKBOOK_INVALID", "The workbook could not be serialized.");
  }
  const protectedBytes = await protectWorkbookStructure(serialized);
  return Uint8Array.prototype.slice.call(protectedBytes);
}
