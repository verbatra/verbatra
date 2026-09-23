import type { LocaleResource, TranslationEntry } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import { keyProvenance, originsOf, summarizeProvenance } from "./key-provenance.js";
import { type ProvenanceRecord, valueHash } from "./provenance-file.js";

function resource(values: Record<string, string>): LocaleResource {
  const entries = new Map<string, TranslationEntry>();
  for (const [key, value] of Object.entries(values)) {
    entries.set(key, { key, namespace: "", value, placeholders: [], isPlural: false });
  }
  return { locale: "de", namespace: "", format: "i18next-json", entries };
}

describe("keyProvenance", () => {
  it("reports unrecorded for a key with no record", () => {
    expect(keyProvenance(undefined, "Hallo")).toEqual({
      origin: "unrecorded",
      reviewState: "unreviewed",
    });
  });

  it("reports external when the record describes a different value", () => {
    const record: ProvenanceRecord = {
      origin: "human",
      valueHash: valueHash("Hallo"),
      reviewState: "approved",
      reviewer: "mk",
    };
    expect(keyProvenance(record, "Servus")).toEqual({
      origin: "external",
      reviewState: "unreviewed",
    });
  });

  it("reports the stored record when it matches the value", () => {
    const record: ProvenanceRecord = {
      origin: "machine",
      provider: "anthropic",
      model: "m",
      valueHash: valueHash("Hallo"),
      reviewState: "approved",
      reviewer: "mk",
    };
    expect(keyProvenance(record, "Hallo")).toEqual({
      origin: "machine",
      provider: "anthropic",
      model: "m",
      reviewState: "approved",
      reviewer: "mk",
    });
  });

  it("reads an origin and review state from a newer release as unknown and unreviewed", () => {
    const record: ProvenanceRecord = {
      origin: "derived",
      valueHash: valueHash("Hallo"),
      reviewState: "final",
    };
    expect(keyProvenance(record, "Hallo")).toEqual({
      origin: "unknown",
      reviewState: "unreviewed",
    });
  });

  it("reports a rejected value as rejected", () => {
    const record: ProvenanceRecord = {
      origin: "machine",
      valueHash: valueHash("x"),
      reviewState: "rejected",
    };
    expect(keyProvenance(record, "x").reviewState).toBe("rejected");
  });
});

describe("summarizeProvenance and originsOf", () => {
  const records = new Map<string, ProvenanceRecord>([
    ["a", { origin: "machine", valueHash: valueHash("A") }],
    ["b", { origin: "human", valueHash: valueHash("old"), reviewState: "approved" }],
    ["c", { origin: "import", valueHash: valueHash("C"), reviewState: "approved" }],
  ]);
  const source = resource({ a: "a", b: "b", c: "c", d: "d" });
  const target = resource({ a: "A", b: "B", c: "C", d: "D", orphan: "O" });

  it("counts every translated key by origin and review state, skipping orphans", () => {
    expect(summarizeProvenance(records, source, target)).toEqual({
      byOrigin: {
        machine: 1,
        memory: 0,
        fuzzy: 0,
        agent: 0,
        human: 0,
        import: 1,
        unknown: 0,
        unrecorded: 1,
        external: 1,
      },
      byReviewState: { unreviewed: 3, approved: 1, rejected: 0 },
    });
  });

  it("names the origin of each requested key the target holds", () => {
    expect(originsOf(records, target, ["a", "b", "missing"])).toEqual({
      a: "machine",
      b: "external",
    });
  });
});
