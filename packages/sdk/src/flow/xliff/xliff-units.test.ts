import type { LocaleResource } from "@verbatra/core";
import type { WorkbookRow } from "@verbatra/exchange";
import { describe, expect, it } from "vitest";
import { valueHash } from "../../lock/provenance-file.js";
import { exportState, inlineSpans, xliffUnits } from "./xliff-units.js";

function row(overrides: Partial<WorkbookRow>): WorkbookRow {
  return {
    key: "k",
    source: "Hello",
    currentTarget: "Hallo",
    status: "unchanged",
    sourceHash: "h",
    translation: "",
    context: "",
    reviewStatus: "ok",
    reviewReasons: "",
    ...overrides,
  };
}

describe("exportState", () => {
  it("marks a missing or stale key initial", () => {
    expect(exportState(row({ status: "new" }), undefined, undefined)).toBe("initial");
    expect(exportState(row({ status: "changed" }), undefined, undefined)).toBe("initial");
  });

  it("marks an up-to-date key by its review state", () => {
    const record = (reviewState?: string) => ({
      origin: "machine",
      valueHash: valueHash("Hallo"),
      ...(reviewState !== undefined ? { reviewState } : {}),
    });
    expect(exportState(row({}), undefined, "h")).toBe("translated");
    expect(exportState(row({}), record(), "h")).toBe("translated");
    expect(exportState(row({}), record("approved"), "h")).toBe("reviewed");
    expect(exportState(row({}), record("rejected"), "h")).toBe("initial");
  });
});

describe("inlineSpans", () => {
  it("turns protected syntax into codes and joins back to the value", () => {
    expect(inlineSpans("Hi {{name}}")).toEqual([
      { kind: "text", text: "Hi " },
      { kind: "code", code: "{{name}}" },
    ]);
    expect(inlineSpans("")).toEqual([]);
  });
});

describe("xliffUnits", () => {
  it("carries the description and meaning as notes and leaves a new key without target", () => {
    const source: LocaleResource = {
      locale: "en",
      namespace: "",
      format: "i18next-json",
      entries: new Map([
        [
          "k",
          {
            key: "k",
            namespace: "",
            value: "Hello",
            description: "Greets the user",
            meaning: "salutation",
            placeholders: [],
            isPlural: false,
          },
        ],
        [
          "empty",
          {
            key: "empty",
            namespace: "",
            value: "x",
            description: "",
            placeholders: [],
            isPlural: false,
          },
        ],
      ]),
    };
    const units = xliffUnits({
      rows: [row({ status: "new", currentTarget: "" }), row({ key: "empty", status: "changed" })],
      source,
      records: new Map(),
      baseline: new Map(),
    });
    expect(units[0]).toEqual({
      key: "k",
      source: [{ kind: "text", text: "Hello" }],
      state: "initial",
      sourceHash: "h",
      notes: [
        { category: "description", text: "Greets the user" },
        { category: "meaning", text: "salutation" },
      ],
    });
    expect(units[1]?.target).toEqual([{ kind: "text", text: "Hallo" }]);
    expect(units[1]?.notes).toEqual([]);
  });
});
