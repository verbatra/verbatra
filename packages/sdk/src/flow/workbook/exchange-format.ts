import { extname } from "node:path";
import {
  type DelimitedFormat,
  delimitedFileName,
  XLIFF_FILE_EXTENSION,
  type XliffVersion,
  xliffFileName,
} from "@verbatra/exchange";

/**
 * The two XLIFF handoff shapes: `xliff2` writes XLIFF 2.0 and `xliff12` writes XLIFF 1.2, for a
 * CAT tool that does not read 2.0 yet. On import both read either version, which is taken from the
 * file itself.
 */
export type XliffFormat = "xliff2" | "xliff12";

/**
 * The file shape of a translator handoff: a single styled `.xlsx` workbook with one sheet per
 * locale, one plain `.csv` or `.tsv` file per locale, or one XLIFF `.xlf` file per locale.
 *
 * The workbook is the friendlier artifact to hand a human translator, the delimited forms are
 * easier to diff, review, and feed to another tool, and XLIFF is the interchange standard of the
 * CAT tools translation agencies work in. {@link exportWorkbook} and {@link importWorkbook} both
 * accept each of them.
 */
export type ExchangeFormat = "xlsx" | DelimitedFormat | XliffFormat;

const exchangeFormatMembers: { [K in ExchangeFormat]: K } = {
  xlsx: "xlsx",
  csv: "csv",
  tsv: "tsv",
  xliff2: "xliff2",
  xliff12: "xliff12",
};

/**
 * Every {@link ExchangeFormat} at runtime, for a tool that has to validate a `--format` argument or
 * offer the choices to a user. The order is the order to present them in: the workbook first, then
 * the delimited forms, then XLIFF.
 *
 * It is derived from a record keyed by {@link ExchangeFormat} itself, so a format added to the type
 * without being added here fails to compile. A consumer that checks membership against this list can
 * therefore never silently reject a format the SDK accepts.
 */
export const EXCHANGE_FORMATS: readonly ExchangeFormat[] = Object.values(exchangeFormatMembers);

/** The {@link ExchangeFormat} {@link exportWorkbook} and {@link importWorkbook} use when the caller names none. */
export const DEFAULT_EXCHANGE_FORMAT: ExchangeFormat = "xlsx";

export type DirectoryFormat = DelimitedFormat | XliffFormat;

export type HandoffFamily = DelimitedFormat | "xliff";

export function isDelimitedFormat(format: ExchangeFormat): format is DelimitedFormat {
  return format === "csv" || format === "tsv";
}

export function isXliffFormat(format: ExchangeFormat): format is XliffFormat {
  return format === "xliff2" || format === "xliff12";
}

export function isDirectoryFormat(format: ExchangeFormat): format is DirectoryFormat {
  return format !== "xlsx";
}

export function handoffFamily(format: DirectoryFormat): HandoffFamily {
  return isXliffFormat(format) ? "xliff" : format;
}

export function handoffExtension(format: DirectoryFormat): string {
  return isXliffFormat(format) ? XLIFF_FILE_EXTENSION : format;
}

export function handoffFileName(locale: string, format: DirectoryFormat): string {
  return isXliffFormat(format) ? xliffFileName(locale) : delimitedFileName(locale, format);
}

export function xliffVersionOf(format: XliffFormat): XliffVersion {
  return format === "xliff2" ? "2.0" : "1.2";
}

const XLIFF_EXTENSIONS: ReadonlySet<string> = new Set([".xlf", ".xliff"]);

export function isXliffPath(path: string): boolean {
  return XLIFF_EXTENSIONS.has(extname(path).toLowerCase());
}

export function importFormatFor(format: ExchangeFormat | undefined, path: string): ExchangeFormat {
  if (format !== undefined) {
    return format;
  }
  return isXliffPath(path) ? "xliff2" : DEFAULT_EXCHANGE_FORMAT;
}
