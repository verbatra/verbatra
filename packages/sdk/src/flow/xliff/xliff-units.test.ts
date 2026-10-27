import type { LocaleResource } from "@verbatra/core";
import type { WorkbookRow } from "@verbatra/exchange";
import { describe, expect, it } from "vitest";
import { valueHash } from "../../lock/provenance-file.js";
import { exportProvenance, exportState, inlineSpans, xliffUnits } from "./xliff-units.js";

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
    expect(units[1]?.provenance).toEqual({
      origin: "unrecorded",
      reviewState: "unreviewed",
      machineSuggestion: false,
    });
  });

  it("leaves provenance out of every unit when the provenance file could not be read", () => {
    const source: LocaleResource = {
      locale: "en",
      namespace: "",
      format: "i18next-json",
      entries: new Map(),
    };
    const units = xliffUnits({ rows: [row({})], source, records: undefined, baseline: new Map() });
    expect(units[0]?.provenance).toBeUndefined();
    expect(units[0]?.state).toBe("translated");
  });
});

describe("exportProvenance", () => {
  const record = (origin: string, reviewState?: string, value = "Hallo") => ({
    origin,
    valueHash: valueHash(value),
    ...(reviewState !== undefined ? { reviewState } : {}),
  });

  it.each(["machine", "memory", "fuzzy", "agent"])(
    "marks an unreviewed %s value as a machine suggestion",
    (origin) => {
      expect(exportProvenance(row({}), record(origin), "h")).toEqual({
        origin,
        reviewState: "unreviewed",
        machineSuggestion: true,
      });
    },
  );

  it("marks a rejected machine value that is back in the file as a machine suggestion", () => {
    expect(exportProvenance(row({}), record("machine", "rejected"), "h").machineSuggestion).toBe(
      true,
    );
  });

  it("does not mark an approved machine value, since a person reviewed it", () => {
    expect(exportProvenance(row({}), record("machine", "approved"), "h")).toEqual({
      origin: "machine",
      reviewState: "approved",
      machineSuggestion: false,
    });
  });

  it.each([
    ["human", record("human")],
    ["import", record("import")],
    ["unknown", record("unknown")],
    ["external", record("machine", undefined, "Something else")],
    ["unrecorded", undefined],
  ])("does not claim a machine suggestion for a %s value", (origin, stored) => {
    expect(exportProvenance(row({}), stored, "h")).toEqual({
      origin,
      reviewState: "unreviewed",
      machineSuggestion: false,
    });
  });
});
