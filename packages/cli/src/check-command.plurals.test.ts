import type { CheckSummary, IncompletePlural, LocaleQaReport } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import { renderCheckHuman } from "./render.js";
import { run } from "./run.js";
import { captureStreams, makeCheckSummary, parseEnvelope, recordingDeps } from "./test-support.js";

const CLEAN_QA: LocaleQaReport = { checked: 2, errors: 0, warnings: 0, findings: [] };

const FILES: IncompletePlural = {
  code: "PLURAL_CATEGORIES_INCOMPLETE",
  key: "files",
  ruleType: "cardinal",
  missing: ["few", "many"],
};

const ICU_ORDINAL: IncompletePlural = {
  code: "PLURAL_CATEGORIES_INCOMPLETE",
  key: "place",
  argument: "n",
  ruleType: "ordinal",
  missing: ["two", "few"],
};

const ICU_CARDINAL: IncompletePlural = { ...ICU_ORDINAL, key: "count", ruleType: "cardinal" };

const KEY_ORDINAL: IncompletePlural = { ...FILES, key: "rank_ordinal", ruleType: "ordinal" };

function summaryWith(incompletePlurals: readonly IncompletePlural[], withQa = false): CheckSummary {
  return makeCheckSummary({
    inSync: true,
    locales: [
      {
        locale: "pl",
        missing: 0,
        stale: 0,
        upToDate: 2,
        inSync: true,
        incompletePlurals,
        ...(withQa ? { qa: CLEAN_QA } : {}),
      },
    ],
    ...(withQa ? { qa: { errors: 0, warnings: 0, invalidSourceKeys: [] } } : {}),
  });
}

describe("check: incomplete plurals", () => {
  it("renders each incomplete plural under a warning heading", () => {
    const text = renderCheckHuman(summaryWith([FILES, ICU_CARDINAL, ICU_ORDINAL, KEY_ORDINAL]));

    expect(text).toContain("plural categories (warning: exit 1 only under --qa --strict)");
    expect(text).toContain("  pl: 4 plurals missing CLDR categories");
    expect(text).toContain("    files: missing few, many");
    expect(text).toContain("    count {n} plural: missing two, few");
    expect(text).toContain("    place {n} selectordinal: missing two, few");
    expect(text).toContain("    rank_ordinal (ordinal): missing few, many");
  });

  it("renders no plural section when every plural is complete or the field is absent", () => {
    expect(renderCheckHuman(summaryWith([]))).not.toContain("plural categories");
    const absent = makeCheckSummary({
      locales: [{ locale: "pl", missing: 0, stale: 0, upToDate: 1, inSync: true }],
    });
    expect(renderCheckHuman(absent)).not.toContain("plural categories");
  });

  it("keeps exit 0 for a plain check that only has incomplete plurals", async () => {
    const { deps } = recordingDeps({ check: async () => summaryWith([FILES]) });
    const cap = captureStreams();

    const code = await run(["check", "--json"], deps, cap.streams);

    expect(code).toBe(0);
    const envelope = parseEnvelope(cap.out());
    expect(envelope.result).toMatchObject({ locales: [{ incompletePlurals: [FILES] }] });
  });

  it("keeps exit 0 under --qa without --strict", async () => {
    const { deps } = recordingDeps({ check: async () => summaryWith([FILES], true) });
    const cap = captureStreams();

    expect(await run(["check", "--qa"], deps, cap.streams)).toBe(0);
  });

  it("exits 1 under --qa --strict when a plural is incomplete", async () => {
    const { deps } = recordingDeps({ check: async () => summaryWith([FILES], true) });
    const cap = captureStreams();

    expect(await run(["check", "--qa", "--strict"], deps, cap.streams)).toBe(1);
  });

  it("exits 0 under --qa --strict when every plural is complete", async () => {
    const { deps } = recordingDeps({ check: async () => summaryWith([], true) });
    const cap = captureStreams();

    expect(await run(["check", "--qa", "--strict"], deps, cap.streams)).toBe(0);
  });
});
