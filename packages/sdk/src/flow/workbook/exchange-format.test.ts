import { describe, expect, it } from "vitest";
import {
  DEFAULT_EXCHANGE_FORMAT,
  EXCHANGE_FORMATS,
  type ExchangeFormat,
  handoffExtension,
  handoffFamily,
  handoffFileName,
  importFormatFor,
  isDelimitedFormat,
  isDirectoryFormat,
  isXliffFormat,
  isXliffPath,
  xliffVersionOf,
} from "./exchange-format.js";

describe("EXCHANGE_FORMATS", () => {
  it("enumerates every format the type admits, workbook first", () => {
    expect(EXCHANGE_FORMATS).toEqual(["xlsx", "csv", "tsv", "xliff2", "xliff12"]);
  });

  it("has no duplicate member", () => {
    expect(new Set(EXCHANGE_FORMATS).size).toBe(EXCHANGE_FORMATS.length);
  });

  it("classifies every member as the workbook, a delimited form, or XLIFF", () => {
    expect(EXCHANGE_FORMATS.filter((format) => isDelimitedFormat(format))).toEqual(["csv", "tsv"]);
    expect(EXCHANGE_FORMATS.filter((format) => isXliffFormat(format))).toEqual([
      "xliff2",
      "xliff12",
    ]);
    expect(EXCHANGE_FORMATS.filter((format) => !isDirectoryFormat(format))).toEqual(["xlsx"]);
  });

  it("contains the default a caller gets when naming no format", () => {
    expect(EXCHANGE_FORMATS).toContain(DEFAULT_EXCHANGE_FORMAT);
  });

  it("accepts each member where an ExchangeFormat is required", () => {
    const accepted: ExchangeFormat[] = [...EXCHANGE_FORMATS];

    expect(accepted).toHaveLength(EXCHANGE_FORMATS.length);
  });
});

describe("directory handoff naming", () => {
  it("shares one family, extension and manifest between both XLIFF versions", () => {
    expect(handoffFamily("xliff2")).toBe("xliff");
    expect(handoffFamily("xliff12")).toBe("xliff");
    expect(handoffFamily("csv")).toBe("csv");
    expect(handoffExtension("xliff12")).toBe("xlf");
    expect(handoffExtension("tsv")).toBe("tsv");
    expect(handoffFileName("de", "xliff2")).toBe("de.xlf");
    expect(handoffFileName("de", "csv")).toBe("de.csv");
  });

  it("maps each XLIFF format to the version it writes", () => {
    expect(xliffVersionOf("xliff2")).toBe("2.0");
    expect(xliffVersionOf("xliff12")).toBe("1.2");
  });
});

describe("importFormatFor", () => {
  it("keeps a format the caller named", () => {
    expect(importFormatFor("csv", "handoff/de.xlf")).toBe("csv");
  });

  it.each(["de.xlf", "out/DE.XLIFF", "a.b.xliff"])("reads %s as XLIFF", (path) => {
    expect(isXliffPath(path)).toBe(true);
    expect(importFormatFor(undefined, path)).toBe("xliff2");
  });

  it.each([
    ["handoff/de.csv", "csv"],
    ["handoff/DE.CSV", "csv"],
    ["handoff/de.tsv", "tsv"],
    ["out/translations.XLSX", "xlsx"],
  ] as const)("reads %s as %s", (path, format) => {
    expect(importFormatFor(undefined, path)).toBe(format);
  });

  it.each(["handoff", "notes.txt", "de.csv.bak"])("defaults %s to the workbook", (path) => {
    expect(importFormatFor(undefined, path)).toBe("xlsx");
  });
});
