import ExcelJS from "exceljs";
import { beforeAll, describe, expect, it } from "vitest";
import { buildWorkbook } from "./build-workbook.js";
import { readWorkbook } from "./read-workbook.js";
import {
  COERCION_PRONE_TRANSLATIONS,
  expectWorkbookInvalid,
  row,
  singleLocaleModel,
} from "./test-support.js";
import type { WorkbookData, WorkbookModel } from "./types.js";

const model: WorkbookModel = {
  sheets: [
    {
      locale: "de",
      rows: [
        row({
          key: "greeting",
          source: "Hello {name}",
          sourceHash: "abc123",
          context: "A friendly greeting",
        }),
        row({
          key: "farewell",
          source: "Bye",
          currentTarget: "Tschuss",
          status: "changed",
          sourceHash: "def456",
        }),
        row({
          key: "welcome",
          source: "Welcome",
          currentTarget: "Willkommen",
          status: "unchanged",
          sourceHash: "ghi789",
        }),
      ],
    },
    { locale: "fr", rows: [] },
  ],
};

describe("buildWorkbook + readWorkbook round trip", () => {
  describe("same sheets and keys (no instructions sheet)", () => {
    let bytes: Uint8Array;
    let data: WorkbookData;

    beforeAll(async () => {
      bytes = await buildWorkbook(model);
      data = await readWorkbook(bytes);
    });

    it("produces non-empty bytes", () => {
      expect(bytes.byteLength).toBeGreaterThan(0);
    });

    it("reads back the same locales in workbook order", () => {
      expect(data.sheets.map((s) => s.locale)).toEqual(["de", "fr"]);
    });

    it("reads back the same keys in row order", () => {
      expect(data.sheets[0]?.rows.map((r) => r.key)).toEqual(["greeting", "farewell", "welcome"]);
    });

    it("round-trips the source value", () => {
      expect(data.sheets[0]?.rows[0]?.source).toBe("Hello {name}");
    });

    it("round-trips the source hash", () => {
      expect(data.sheets[0]?.rows[0]?.sourceHash).toBe("abc123");
    });

    it("round-trips the changed row's status", () => {
      expect(data.sheets[0]?.rows[1]?.status).toBe("changed");
    });

    it("round-trips the changed row's current target", () => {
      expect(data.sheets[0]?.rows[1]?.currentTarget).toBe("Tschuss");
    });

    it("round-trips the unchanged row's status", () => {
      expect(data.sheets[0]?.rows[2]?.status).toBe("unchanged");
    });

    it("round-trips the unchanged row's current target", () => {
      expect(data.sheets[0]?.rows[2]?.currentTarget).toBe("Willkommen");
    });

    it("leaves translation empty for every unfilled row", () => {
      expect(data.sheets[0]?.rows.every((r) => r.translation === "")).toBe(true);
    });

    it("round-trips context when present", () => {
      expect(data.sheets[0]?.rows[0]?.context).toBe("A friendly greeting");
    });

    it("round-trips context as empty when absent", () => {
      expect(data.sheets[0]?.rows[1]?.context).toBe("");
    });
  });

  it("round-trips a filled translation by key", async () => {
    const filled = singleLocaleModel([
      row({
        key: "greeting",
        source: "Hello {name}",
        sourceHash: "abc123",
        translation: "Hallo {name}",
      }),
    ]);
    const data = await readWorkbook(await buildWorkbook(filled));
    expect(data.sheets[0]?.rows[0]?.translation).toBe("Hallo {name}");
  });

  it("an empty workbook (no rows) still builds and reads zero data rows", async () => {
    const empty = singleLocaleModel([]);
    const data = await readWorkbook(await buildWorkbook(empty));
    expect(data.sheets).toHaveLength(1);
    expect(data.sheets[0]?.rows).toHaveLength(0);
  });

  it("rejects non-xlsx bytes as a structured WORKBOOK_INVALID", async () => {
    await expectWorkbookInvalid(() => readWorkbook(new Uint8Array([1, 2, 3, 4])));
  });

  it("round-trips a flagged review status and its reasons by key", async () => {
    const flagged = singleLocaleModel([
      row({
        key: "greeting",
        source: "Hello {name}",
        currentTarget: "Hello {name}",
        status: "changed",
        sourceHash: "abc123",
        reviewStatus: "review",
        reviewReasons: "length-ratio-outlier, equals-source",
      }),
    ]);
    const data = await readWorkbook(await buildWorkbook(flagged));
    expect(data.sheets[0]?.rows[0]?.reviewStatus).toBe("review");
    expect(data.sheets[0]?.rows[0]?.reviewReasons).toBe("length-ratio-outlier, equals-source");
  });

  it("imports every row of a legacy workbook built with no Review columns at all", async () => {
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
    ].forEach((label, index) => {
      sheet.getRow(1).getCell(index + 1).value = label;
    });
    sheet.getRow(2).getCell(1).value = "greeting";
    sheet.getRow(2).getCell(2).value = "Hello";
    sheet.getRow(2).getCell(4).value = "new";
    sheet.getRow(2).getCell(6).value = "abc123";
    sheet.getRow(3).getCell(1).value = "farewell";
    sheet.getRow(3).getCell(2).value = "Bye";
    sheet.getRow(3).getCell(4).value = "new";
    sheet.getRow(3).getCell(6).value = "def456";
    const buffer = await workbook.xlsx.writeBuffer();

    const data = await readWorkbook(new Uint8Array(buffer as ArrayBuffer));
    expect(data.sheets[0]?.rows).toHaveLength(2);
    for (const resultRow of data.sheets[0]?.rows ?? []) {
      expect(resultRow.reviewStatus).toBe("ok");
      expect(resultRow.reviewReasons).toBe("");
    }
  });
});

describe("buildWorkbook + readWorkbook round trip: coercion-prone translations", () => {
  it.each(COERCION_PRONE_TRANSLATIONS)("imports %j verbatim", async (translation) => {
    const coercionModel = singleLocaleModel([
      row({ key: "value", source: "Source", sourceHash: "abc123", translation }),
    ]);
    const data = await readWorkbook(await buildWorkbook(coercionModel));
    expect(data.sheets[0]?.rows[0]?.translation).toBe(translation);
  });
});

describe("buildWorkbook + readWorkbook round trip: formula-lead values survive intact", () => {
  it.each(["=", "+", "-", "@"])(
    "round-trips a source value starting with %j exactly, not as the escaped apostrophe form",
    async (lead) => {
      const model = singleLocaleModel([row({ source: `${lead}cmd(1)`, sourceHash: "abc123" })]);
      const data = await readWorkbook(await buildWorkbook(model));
      expect(data.sheets[0]?.rows[0]?.source).toBe(`${lead}cmd(1)`);
    },
  );

  it.each(["=", "+", "-", "@"])(
    "round-trips a current-translation value starting with %j exactly",
    async (lead) => {
      const model = singleLocaleModel([
        row({ currentTarget: `${lead}cmd(1)`, sourceHash: "abc123" }),
      ]);
      const data = await readWorkbook(await buildWorkbook(model));
      expect(data.sheets[0]?.rows[0]?.currentTarget).toBe(`${lead}cmd(1)`);
    },
  );

  it.each(["=", "+", "-", "@"])(
    "round-trips a translation value starting with %j exactly",
    async (lead) => {
      const model = singleLocaleModel([
        row({ translation: `${lead}cmd(1)`, sourceHash: "abc123" }),
      ]);
      const data = await readWorkbook(await buildWorkbook(model));
      expect(data.sheets[0]?.rows[0]?.translation).toBe(`${lead}cmd(1)`);
    },
  );

  it.each(["=", "+", "-", "@"])(
    "round-trips a context value starting with %j exactly",
    async (lead) => {
      const model = singleLocaleModel([row({ context: `${lead}cmd(1)`, sourceHash: "abc123" })]);
      const data = await readWorkbook(await buildWorkbook(model));
      expect(data.sheets[0]?.rows[0]?.context).toBe(`${lead}cmd(1)`);
    },
  );
});

describe("buildWorkbook + readWorkbook round trip: the Key column is not formula-guarded", () => {
  it("round-trips a key shaped like a formula lead unchanged, since Key is never escaped on write", async () => {
    const model = singleLocaleModel([row({ key: "=weird.key", sourceHash: "abc123" })]);
    const data = await readWorkbook(await buildWorkbook(model));
    expect(data.sheets[0]?.rows[0]?.key).toBe("=weird.key");
  });
});
