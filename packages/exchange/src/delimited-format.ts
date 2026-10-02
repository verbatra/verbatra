import { handoffFileName } from "./handoff-file-name.js";

/**
 * The two delimiter-separated interchange formats. They are one implementation with one parameter, the
 * field delimiter: `tsv` is not a second format, it is `csv` with a tab. The member is also the file
 * extension an export writes and an import reads back.
 */
export type DelimitedFormat = "csv" | "tsv";

export const DELIMITER: Readonly<Record<DelimitedFormat, string>> = {
  csv: ",",
  tsv: "\t",
};

export const QUOTE = '"';

export const UTF8_BOM = "\ufeff";

export function delimitedFileName(locale: string, format: DelimitedFormat): string {
  return handoffFileName(locale, format, "WORKBOOK_INVALID");
}
