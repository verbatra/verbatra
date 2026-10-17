import { createValueMarker } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import { redactRunSummary } from "./run-summary-redaction.js";
import {
  markFields,
  markRecord,
  redactWriteResult,
  withoutReviewer,
  withProvenanceRedacted,
} from "./value-redaction.js";

const marker = createValueMarker(new Uint8Array([7]));

const SECRET = "Projekt Falke";

function emptyLocale(locale: string) {
  return {
    locale,
    status: "succeeded" as const,
    translated: [],
    unchanged: [],
    orphaned: [],
    pruned: [],
    invalidIcuSource: [],
    cacheHits: [],
    fuzzyHits: [],
    integrityMismatches: [],
    providerFailures: [],
    generated: [],
    budgetWithheld: [],
    sensitiveWithheld: [],
    notices: [],
    needsReview: [],
    unfilled: [],
    protected: [],
    malformedRows: [],
    duplicateKeys: [],
  };
}

describe("value redaction helpers", () => {
  it("marks only the named string fields that are present", () => {
    const marked = markFields(
      { key: "title", source: SECRET, target: undefined as string | undefined },
      ["source", "target"],
      marker,
    );

    expect(marked).toEqual({ key: "title", source: marker.mark(SECRET), target: undefined });
  });

  it("maps every value of a record", () => {
    expect(markRecord({ de: SECRET }, (value) => marker.mark(value))).toEqual({
      de: marker.mark(SECRET),
    });
  });

  it("drops the reviewer from a provenance and leaves a value without one alone", () => {
    expect(withoutReviewer({ origin: "machine", reviewer: "Ada" })).toEqual({ origin: "machine" });
    const bare: { key: string; provenance?: { reviewer?: string } } = { key: "title" };

    expect(withProvenanceRedacted(bare)).toBe(bare);
    expect(withProvenanceRedacted({ key: "title", provenance: { reviewer: "Ada" } })).toEqual({
      key: "title",
      provenance: {},
    });
  });

  it("marks the written value and drops the integrity details", () => {
    expect(
      redactWriteResult({ accepted: false, value: SECRET, details: [SECRET] }, marker),
    ).toEqual({ accepted: false, value: marker.mark(SECRET) });
  });
});

describe("redactRunSummary", () => {
  it("marks fuzzy-hit sources and protected suggestions and drops refusal details", () => {
    const summary = {
      dryRun: false,
      succeeded: ["de"],
      partial: [],
      failed: [],
      locales: [
        {
          ...emptyLocale("de"),
          fuzzyHits: [{ key: "title", previousSource: SECRET, similarity: 0.9 }],
          protected: [
            { key: "title", reason: "human" as const, suggestion: SECRET },
            { key: "body", reason: "pinned" as const },
          ],
          integrityRefusals: [{ key: "title", reason: "placeholder" as const, details: [SECRET] }],
        },
        emptyLocale("fr"),
      ],
    };

    const redacted = redactRunSummary(summary, marker);

    expect(JSON.stringify(redacted)).not.toContain(SECRET);
    expect(redacted.locales[0]).toMatchObject({
      fuzzyHits: [{ key: "title", previousSource: marker.mark(SECRET), similarity: 0.9 }],
      protected: [
        { key: "title", reason: "human", suggestion: marker.mark(SECRET) },
        { key: "body", reason: "pinned" },
      ],
      integrityRefusals: [{ key: "title", reason: "placeholder" }],
    });
    expect(redacted.locales[1]).toEqual(emptyLocale("fr"));
  });
});
