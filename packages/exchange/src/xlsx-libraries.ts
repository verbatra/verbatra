import type ExcelJS from "exceljs";
import type JSZip from "jszip";

export async function loadExcelJs(): Promise<typeof ExcelJS> {
  return (await import("exceljs")).default;
}

export async function loadJsZip(): Promise<typeof JSZip> {
  return (await import("jszip")).default;
}
