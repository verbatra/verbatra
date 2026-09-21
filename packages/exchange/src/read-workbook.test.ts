import ExcelJS from "exceljs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildWorkbook } from "./build-workbook.js";
import { DEFAULT_WORKBOOK_LIMITS } from "./limits.js";
import { readWorkbook } from "./read-workbook.js";
import { expectWorkbookInvalid, row, singleLocaleModel } from "./test-support.js";
import type { WorkbookModel } from "./types.js";
import { declaredSize } from "./zip-guard.js";

const baseModel = singleLocaleModel([
  row({ key: "k1", source: "Hello", sourceHash: "h1", context: "A greeting" }),
]);

describe("readWorkbook: structural rejection", () => {
  it("reads a valid workbook", async () => {
    const data = await buildWorkbook(baseModel);
    expect((await readWorkbook(data)).sheets[0]?.rows[0]?.key).toBe("k1");
  });

  it("reads the context column back verbatim", async () => {
    const data = await buildWorkbook(baseModel);
    expect((await readWorkbook(data)).sheets[0]?.rows[0]?.context).toBe("A greeting");
  });

  it("reads a pre-change workbook with no Context column as an empty context, not a rejection", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("de");
    ["Key", "Source", "Current translation", "Status", "Translation", "Source hash"].forEach(
      (label, index) => {
        sheet.getRow(1).getCell(index + 1).value = label;
      },
    );
    sheet.getRow(2).getCell(1).value = "k1";
    sheet.getRow(2).getCell(4).value = "new";
    const buffer = await workbook.xlsx.writeBuffer();
    const data = await readWorkbook(new Uint8Array(buffer as ArrayBuffer));
    expect(data.sheets[0]?.rows[0]?.context).toBe("");
  });

  it("reads a well-formed review status and reasons cell verbatim", async () => {
    const flagged: WorkbookModel = {
      sheets: [
        {
          locale: "de",
          rows: [
            {
              key: "k1",
              source: "Hello {name}",
              currentTarget: "Hello {name}",
              status: "changed",
              sourceHash: "h1",
              translation: "",
              context: "",
              reviewStatus: "review",
              reviewReasons: "length-ratio-outlier, equals-source",
            },
          ],
        },
      ],
    };
    const data = await readWorkbook(await buildWorkbook(flagged));
    expect(data.sheets[0]?.rows[0]?.reviewStatus).toBe("review");
    expect(data.sheets[0]?.rows[0]?.reviewReasons).toBe("length-ratio-outlier, equals-source");
  });

  it("falls back an unrecognized review-status cell to ok via .catch, not a rejection", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("de");
    [
      "Key",
      "Source",
      "Current translation",
      "Status",
      "Translation",
      "Source hash",
      "Context",
      "Review status",
      "Review reasons",
    ].forEach((label, index) => {
      sheet.getRow(1).getCell(index + 1).value = label;
    });
    sheet.getRow(2).getCell(1).value = "k1";
    sheet.getRow(2).getCell(4).value = "new";
    sheet.getRow(2).getCell(8).value = "not-a-status";
    const buffer = await workbook.xlsx.writeBuffer();
    const data = await readWorkbook(new Uint8Array(buffer as ArrayBuffer));
    expect(data.sheets[0]?.rows[0]?.reviewStatus).toBe("ok");
  });

  it("reads a pre-change (legacy) workbook with no Review columns as ok/empty, not a rejection", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("de");
    ["Key", "Source", "Current translation", "Status", "Translation", "Source hash"].forEach(
      (label, index) => {
        sheet.getRow(1).getCell(index + 1).value = label;
      },
    );
    sheet.getRow(2).getCell(1).value = "k1";
    sheet.getRow(2).getCell(4).value = "new";
    const buffer = await workbook.xlsx.writeBuffer();
    const data = await readWorkbook(new Uint8Array(buffer as ArrayBuffer));
    expect(data.sheets[0]?.rows[0]?.reviewStatus).toBe("ok");
    expect(data.sheets[0]?.rows[0]?.reviewReasons).toBe("");
  });

  it("rejects a data sheet missing the Key/Source-hash header", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("de");
    sheet.getRow(1).getCell(1).value = "NotKey";
    sheet.getRow(2).getCell(1).value = "k1";
    const buffer = await workbook.xlsx.writeBuffer();
    await expectWorkbookInvalid(() => readWorkbook(new Uint8Array(buffer as ArrayBuffer)));
  });

  it("rejects a data sheet whose middle columns are reordered even though Key and Source hash are correct", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("de");
    ["Key", "Status", "Current translation", "Source", "Translation", "Source hash"].forEach(
      (label, index) => {
        sheet.getRow(1).getCell(index + 1).value = label;
      },
    );
    sheet.getRow(2).getCell(1).value = "k1";
    sheet.getRow(2).getCell(2).value = "new";
    const buffer = await workbook.xlsx.writeBuffer();
    await expectWorkbookInvalid(() => readWorkbook(new Uint8Array(buffer as ArrayBuffer)));
  });

  it("coerces non-string cell values (numbers) to strings on read", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("de");
    ["Key", "Source", "Current translation", "Status", "Translation", "Source hash"].forEach(
      (label, index) => {
        sheet.getRow(1).getCell(index + 1).value = label;
      },
    );
    sheet.getRow(2).getCell(1).value = 42;
    sheet.getRow(2).getCell(4).value = "new";
    sheet.getRow(2).getCell(6).value = 123;
    const buffer = await workbook.xlsx.writeBuffer();
    const data = await readWorkbook(new Uint8Array(buffer as ArrayBuffer));
    expect(data.sheets[0]?.rows[0]?.key).toBe("42");
    expect(data.sheets[0]?.rows[0]?.sourceHash).toBe("123");
  });

  it("skips wholly blank trailing rows (no key) without error", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("de");
    ["Key", "Source", "Current translation", "Status", "Translation", "Source hash"].forEach(
      (label, index) => {
        sheet.getRow(1).getCell(index + 1).value = label;
      },
    );
    sheet.getRow(2).getCell(1).value = "k1";
    sheet.getRow(2).getCell(4).value = "new";
    sheet.getRow(4).getCell(1).value = "k2";
    sheet.getRow(4).getCell(4).value = "new";
    const buffer = await workbook.xlsx.writeBuffer();
    const data = await readWorkbook(new Uint8Array(buffer as ArrayBuffer));
    expect(data.sheets[0]?.rows.map((r) => r.key)).toEqual(["k1", "k2"]);
  });

  it("coerces a rich-text (object) cell to its rendered text on read", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("de");
    ["Key", "Source", "Current translation", "Status", "Translation", "Source hash"].forEach(
      (label, index) => {
        sheet.getRow(1).getCell(index + 1).value = label;
      },
    );
    sheet.getRow(2).getCell(1).value = { richText: [{ text: "k" }, { text: "1" }] };
    sheet.getRow(2).getCell(4).value = "new";
    const buffer = await workbook.xlsx.writeBuffer();
    const data = await readWorkbook(new Uint8Array(buffer as ArrayBuffer));
    expect(data.sheets[0]?.rows[0]?.key).toBe("k1");
  });

  it("rejects a valid zip whose workbook part exceljs cannot parse", async () => {
    const valid = await buildWorkbook(baseModel);
    const zip = await JSZip.loadAsync(valid);
    zip.file("xl/workbook.xml", "<workbook><<<not valid xml");
    const bytes = await zip.generateAsync({ type: "uint8array" });
    await expectWorkbookInvalid(() => readWorkbook(bytes));
  });

  it("accepts a row with status 'unchanged'", async () => {
    const withUnchanged: WorkbookModel = {
      sheets: [
        {
          locale: "de",
          rows: [
            {
              key: "k1",
              source: "Hello",
              currentTarget: "Hallo",
              status: "unchanged",
              sourceHash: "h1",
              translation: "",
              context: "",
              reviewStatus: "ok",
              reviewReasons: "",
            },
          ],
        },
      ],
    };
    const data = await readWorkbook(await buildWorkbook(withUnchanged));
    expect(data.sheets[0]?.rows[0]?.status).toBe("unchanged");
  });

  it("reports a row with an unrecognized status as a malformed row instead of throwing", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("de");
    ["Key", "Source", "Current translation", "Status", "Translation", "Source hash"].forEach(
      (label, index) => {
        sheet.getRow(1).getCell(index + 1).value = label;
      },
    );
    sheet.getRow(2).getCell(1).value = "good";
    sheet.getRow(2).getCell(4).value = "new";
    sheet.getRow(3).getCell(1).value = "bad";
    sheet.getRow(3).getCell(4).value = "weird";
    const data = await readWorkbook(
      new Uint8Array((await workbook.xlsx.writeBuffer()) as ArrayBuffer),
    );

    expect(data.sheets[0]?.rows.map((r) => r.key)).toEqual(["good"]);
    expect(data.malformedRows).toEqual([{ locale: "de", row: 3, column: "Status" }]);
  });

  it("reads the Key column verbatim, keeping legitimate surrounding whitespace", async () => {
    const withSpacedKey: WorkbookModel = {
      sheets: [
        {
          locale: "de",
          rows: [
            {
              key: " spaced key ",
              source: "Hello",
              currentTarget: "",
              status: "new",
              sourceHash: "h1",
              translation: "",
              context: "",
              reviewStatus: "ok",
              reviewReasons: "",
            },
          ],
        },
      ],
    };
    const data = await readWorkbook(await buildWorkbook(withSpacedKey));
    expect(data.sheets[0]?.rows[0]?.key).toBe(" spaced key ");
  });

  it("reads a whitespace-only translation cell back as an empty string", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("de");
    ["Key", "Source", "Current translation", "Status", "Translation", "Source hash"].forEach(
      (label, index) => {
        sheet.getRow(1).getCell(index + 1).value = label;
      },
    );
    sheet.getRow(2).getCell(1).value = "k1";
    sheet.getRow(2).getCell(4).value = "new";
    sheet.getRow(2).getCell(5).value = "   ";
    const data = await readWorkbook(
      new Uint8Array((await workbook.xlsx.writeBuffer()) as ArrayBuffer),
    );

    expect(data.sheets[0]?.rows[0]?.translation).toBe("");
  });

  it("trims surrounding whitespace from a filled translation cell", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("de");
    ["Key", "Source", "Current translation", "Status", "Translation", "Source hash"].forEach(
      (label, index) => {
        sheet.getRow(1).getCell(index + 1).value = label;
      },
    );
    sheet.getRow(2).getCell(1).value = "k1";
    sheet.getRow(2).getCell(4).value = "new";
    sheet.getRow(2).getCell(5).value = "  Hallo  ";
    const data = await readWorkbook(
      new Uint8Array((await workbook.xlsx.writeBuffer()) as ArrayBuffer),
    );

    expect(data.sheets[0]?.rows[0]?.translation).toBe("Hallo");
  });

  it("keeps the first occurrence of a duplicated key and reports every later one", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("de");
    ["Key", "Source", "Current translation", "Status", "Translation", "Source hash"].forEach(
      (label, index) => {
        sheet.getRow(1).getCell(index + 1).value = label;
      },
    );
    sheet.getRow(2).getCell(1).value = "dup";
    sheet.getRow(2).getCell(4).value = "new";
    sheet.getRow(2).getCell(5).value = "First";
    sheet.getRow(3).getCell(1).value = "dup";
    sheet.getRow(3).getCell(4).value = "new";
    sheet.getRow(3).getCell(5).value = "Second";
    const data = await readWorkbook(
      new Uint8Array((await workbook.xlsx.writeBuffer()) as ArrayBuffer),
    );

    expect(data.sheets[0]?.rows.map((r) => r.translation)).toEqual(["First"]);
    expect(data.duplicateKeys).toEqual([{ locale: "de", key: "dup", row: 3 }]);
  });
});

describe("readWorkbook: parse-bound caps", () => {
  it("trips the sheet-count cap", async () => {
    const many: WorkbookModel = {
      sheets: [
        { locale: "de", rows: [] },
        { locale: "fr", rows: [] },
        { locale: "es", rows: [] },
      ],
    };
    const limits = { ...DEFAULT_WORKBOOK_LIMITS, maxSheetCount: 2 };
    await expectWorkbookInvalid(async () => readWorkbook(await buildWorkbook(many), { limits }));
  });

  it("trips the rows-per-sheet cap", async () => {
    const rows = Array.from({ length: 5 }, (_unused, index) => ({
      key: `k${index}`,
      source: "s",
      currentTarget: "",
      status: "new" as const,
      sourceHash: "h",
      translation: "",
      context: "",
      reviewStatus: "ok" as const,
      reviewReasons: "",
    }));
    const model: WorkbookModel = { sheets: [{ locale: "de", rows }] };
    const limits = { ...DEFAULT_WORKBOOK_LIMITS, maxRowsPerSheet: 2 };
    await expectWorkbookInvalid(async () => readWorkbook(await buildWorkbook(model), { limits }));
  });

  it("trips the cells-per-row cap on a wide forged row", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("de");
    ["Key", "Source", "Current translation", "Status", "Translation", "Source hash"].forEach(
      (label, index) => {
        sheet.getRow(1).getCell(index + 1).value = label;
      },
    );
    sheet.getRow(2).getCell(1).value = "k1";
    sheet.getRow(2).getCell(4).value = "new";
    for (let column = 7; column <= 40; column += 1) {
      sheet.getRow(2).getCell(column).value = "x";
    }
    const bytes = new Uint8Array((await workbook.xlsx.writeBuffer()) as ArrayBuffer);
    const limits = { ...DEFAULT_WORKBOOK_LIMITS, maxCellsPerRow: 10 };
    await expectWorkbookInvalid(() => readWorkbook(bytes, { limits }));
  });

  it("trips the entry-count cap on a crafted zip", async () => {
    const zip = new JSZip();
    for (let index = 0; index < 10; index += 1) {
      zip.file(`file${index}.txt`, "x");
    }
    const bytes = await zip.generateAsync({ type: "uint8array" });
    const limits = { ...DEFAULT_WORKBOOK_LIMITS, maxEntryCount: 3 };
    await expectWorkbookInvalid(() => readWorkbook(bytes, { limits }));
  });

  it("trips the decompressed-bytes cap on a crafted highly-compressible zip", async () => {
    const zip = new JSZip();
    zip.file("big.txt", "A".repeat(2 * 1024 * 1024));
    const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    expect(bytes.byteLength).toBeLessThan(64 * 1024);
    const limits = { ...DEFAULT_WORKBOOK_LIMITS, maxDecompressedBytes: 1024 };
    await expectWorkbookInvalid(() => readWorkbook(bytes, { limits }));
  });

  it("accepts a binary part whose raw bytes are under the actual-bytes cap even though UTF-8 decoding would inflate its byte count past it", async () => {
    const thumbnailRaw = new Uint8Array(1000).fill(0xff);
    const zip = await JSZip.loadAsync(await buildWorkbook(baseModel));
    zip.file("docProps/thumbnail.jpeg", thumbnailRaw, { compression: "STORE" });
    const bytes = await zip.generateAsync({ type: "uint8array" });

    const loaded = await JSZip.loadAsync(bytes);
    const trueRawTotal = Object.values(loaded.files)
      .filter((file) => !file.dir)
      .reduce((sum, file) => sum + (declaredSize(file) ?? 0), 0);
    const limits = { ...DEFAULT_WORKBOOK_LIMITS, maxDecompressedBytes: trueRawTotal + 1000 };
    await expect(readWorkbook(bytes, { limits })).resolves.toBeDefined();
  });

  it("trips the DTD/entity guard on a crafted xlsx-like zip", async () => {
    const zip = new JSZip();
    zip.file("evil.xml", '<?xml version="1.0"?><!DOCTYPE root [<!ENTITY x "y">]><root>&x;</root>');
    const bytes = await zip.generateAsync({ type: "uint8array" });
    await expectWorkbookInvalid(() => readWorkbook(bytes));
  });

  it("trips the DTD/entity guard on a non-.xml part (.vml)", async () => {
    const zip = new JSZip();
    zip.file(
      "xl/drawings/vmlDrawing1.vml",
      '<?xml version="1.0"?><!DOCTYPE root [<!ENTITY x "y">]><root>&x;</root>',
    );
    const bytes = await zip.generateAsync({ type: "uint8array" });
    await expectWorkbookInvalid(() => readWorkbook(bytes));
  });
});
