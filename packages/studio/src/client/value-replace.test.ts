import type {
  ValueReplaceOutcome,
  ValueReplacePreview,
  ValueReplacePreviewEntry,
  ValueReplaceStatus,
} from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import {
  applyParams,
  countRows,
  criteriaFieldOf,
  entriesToApply,
  failureViews,
  isSendable,
  NO_OPT_INS,
  outcomeRows,
  outcomeView,
  previewParams,
  reasonLabel,
  replacedCount,
  statusTone,
  valueCount,
} from "./value-replace.js";

function entry(
  key: string,
  status: ValueReplaceStatus,
  extra: Partial<ValueReplacePreviewEntry> = {},
): ValueReplacePreviewEntry {
  return {
    locale: "de",
    key,
    status,
    valueHash: `hash-${key}`,
    before: "a",
    after: "b",
    excerptCut: false,
    ...extra,
  };
}

function preview(entries: readonly ValueReplacePreviewEntry[]): ValueReplacePreview {
  const counts = {
    ready: 0,
    "stale-source": 0,
    "gate-refused": 0,
    pinned: 0,
    protected: 0,
    "no-source-entry": 0,
    unchanged: 0,
    "too-long": 0,
  };
  for (const item of entries) {
    counts[item.status] += 1;
  }
  return { entries, truncated: false, counts };
}

const CRITERIA = { find: "Welt", replace: "$&", caseSensitive: true, locales: ["de", "fr"] };

describe("applyParams", () => {
  const all = preview([
    entry("ready", "ready"),
    entry("stale", "stale-source"),
    entry("pinned", "pinned"),
    entry("protected", "protected"),
    entry("refused", "gate-refused"),
    entry("long", "too-long"),
    entry("same", "unchanged"),
    entry("orphan", "no-source-entry"),
  ]);

  it("sends only ready and stale-source keys by default, with keys and hashes and no actor", () => {
    const params = applyParams(CRITERIA, all, NO_OPT_INS);

    expect(params).toEqual({
      find: "Welt",
      replace: "$&",
      caseSensitive: true,
      entries: [
        { locale: "de", key: "ready", valueHash: "hash-ready" },
        { locale: "de", key: "stale", valueHash: "hash-stale" },
      ],
    });
    expect(JSON.stringify(params)).not.toContain("actor");
    expect(JSON.stringify(params)).not.toContain("includePinned");
  });

  it("adds pinned and protected entries and their flag only when opted in", () => {
    const pinned = applyParams(CRITERIA, all, { includePinned: true, includeProtected: false });
    const protectedToo = applyParams(CRITERIA, all, {
      includePinned: true,
      includeProtected: true,
    });

    expect(pinned?.entries.map((item) => item.key)).toEqual(["ready", "stale", "pinned"]);
    expect(pinned?.includePinned).toBe(true);
    expect(pinned?.includeProtected).toBeUndefined();
    expect(protectedToo?.entries.map((item) => item.key)).toEqual([
      "ready",
      "stale",
      "pinned",
      "protected",
    ]);
    expect(protectedToo?.includeProtected).toBe(true);
  });

  it("never sends a refused, too-long, unchanged or sourceless entry, even when both opt-ins are on", () => {
    const refusedOnly = preview([
      entry("refused", "gate-refused"),
      entry("long", "too-long"),
      entry("same", "unchanged"),
      entry("orphan", "no-source-entry"),
    ]);

    expect(
      applyParams(CRITERIA, refusedOnly, { includePinned: true, includeProtected: true }),
    ).toBeNull();
  });
});

describe("applyParams request size", () => {
  it("fits 1,000 entries with 20,000-character excerpts behind them in 1 MiB, because it sends keys and hashes only", () => {
    const entries = Array.from({ length: 1000 }, (_, index) =>
      entry(`section.subsection.entry_${String(index).padStart(6, "0")}.label`, "ready", {
        valueHash: "0123456789abcdef",
        before: "x".repeat(20_000),
        after: "y".repeat(20_000),
      }),
    );

    const params = applyParams(CRITERIA, preview(entries), NO_OPT_INS);
    const body = JSON.stringify({ method: "translation.applyValueReplace", params });

    expect(params?.entries).toHaveLength(1000);
    expect(Buffer.byteLength(body)).toBeLessThan(1024 * 1024);
    expect(body).not.toContain("xxxxxxxxxx");
    expect(Object.keys(params?.entries[0] ?? {}).sort()).toEqual(["key", "locale", "valueHash"]);
  });
});

describe("isSendable and entriesToApply", () => {
  it("keeps pinned and protected out by default", () => {
    expect(isSendable("pinned", NO_OPT_INS)).toBe(false);
    expect(isSendable("protected", NO_OPT_INS)).toBe(false);
    expect(isSendable("protected", { includePinned: true, includeProtected: false })).toBe(false);
    expect(isSendable("pinned", { includePinned: false, includeProtected: true })).toBe(false);
    expect(entriesToApply(preview([entry("p", "pinned")]), NO_OPT_INS)).toEqual([]);
  });
});

describe("previewParams", () => {
  it("omits locales when every configured locale is chosen and names them otherwise", () => {
    expect(previewParams(CRITERIA, ["de", "fr"])).toEqual({
      find: "Welt",
      replace: "$&",
      caseSensitive: true,
    });
    expect(previewParams(CRITERIA, ["de", "fr", "es"])).toEqual({
      find: "Welt",
      replace: "$&",
      caseSensitive: true,
      locales: ["de", "fr"],
    });
  });
});

describe("countRows", () => {
  it("lists only statuses that occur, in a fixed order, with their labels", () => {
    const rows = countRows(
      preview([entry("a", "protected"), entry("b", "ready"), entry("c", "ready")]),
    );

    expect(rows.map((row) => [row.status, row.count, row.label])).toEqual([
      ["ready", 2, "Ready"],
      ["protected", 1, "Protected value"],
    ]);
  });
});

describe("outcomeView", () => {
  const cases: readonly [ValueReplaceOutcome, string, string][] = [
    [{ locale: "de", key: "k", status: "applied", staleSource: false }, "Replaced", "success"],
    [
      { locale: "de", key: "k", status: "applied", staleSource: true },
      "Replaced, still out of date",
      "success",
    ],
    [
      { locale: "de", key: "k", status: "skipped", reason: "locale-failed" },
      "Not attempted: the locale failed",
      "danger",
    ],
    [
      { locale: "de", key: "k", status: "skipped", reason: "pinned" },
      "Skipped: pinned key",
      "neutral",
    ],
    [
      { locale: "de", key: "k", status: "refused", reason: "placeholder" },
      "Refused: a placeholder would change",
      "danger",
    ],
    [
      { locale: "de", key: "k", status: "changed" },
      "Not changed: the value changed since the preview",
      "warning",
    ],
    [
      { locale: "de", key: "k", status: "too-long" },
      "Not changed: the new value would be over 20,000 characters",
      "danger",
    ],
  ];

  it.each(cases)("describes %j", (outcome, label, tone) => {
    const view = outcomeView(outcome);
    expect(view.label).toBe(label);
    expect(view.tone).toBe(tone);
  });

  it("carries the details of a refusal", () => {
    expect(
      outcomeView({
        locale: "de",
        key: "k",
        status: "refused",
        reason: "icu",
        details: ["arm one is missing"],
      }).details,
    ).toEqual(["arm one is missing"]);
  });

  it("builds a row per outcome and counts the replaced ones", () => {
    const outcomes: ValueReplaceOutcome[] = [
      { locale: "de", key: "a", status: "applied", staleSource: false },
      { locale: "fr", key: "b", status: "changed" },
    ];

    expect(outcomeRows(outcomes).map((row) => `${row.locale}:${row.key}`)).toEqual([
      "de:a",
      "fr:b",
    ]);
    expect(replacedCount(outcomes)).toBe(1);
  });
});

describe("small helpers", () => {
  it("falls back to the raw reason and prototype names", () => {
    expect(reasonLabel("empty")).toBe("the value would be empty");
    expect(reasonLabel("unknown-reason")).toBe("unknown-reason");
    expect(reasonLabel("constructor")).toBe("constructor");
    expect(statusTone("protected")).toBe("protected");
    expect(valueCount(1)).toBe("1 value");
    expect(valueCount(2)).toBe("2 values");
  });

  it("reports fileWritten only when the sdk says so", () => {
    expect(
      failureViews([
        { locale: "de", code: "LOCK_CONTENDED", message: "m" },
        { locale: "fr", code: "X", message: "n", fileWritten: true },
      ]).map((failure) => failure.fileWritten),
    ).toEqual([false, true]);
  });
});

describe("criteriaFieldOf", () => {
  it("names the field a FIND_TEXT_INVALID message is about, and nothing for other errors", () => {
    expect(
      criteriaFieldOf({
        code: "FIND_TEXT_INVALID",
        message: "The find text must be 1 to 20000 characters, got 0.",
      }),
    ).toBe("find");
    expect(
      criteriaFieldOf({
        code: "FIND_TEXT_INVALID",
        message: "The replace text must not contain an unpaired surrogate code unit.",
      }),
    ).toBe("replace");
    expect(
      criteriaFieldOf({ code: "METHOD_RATE_LIMITED", message: "The replace text" }),
    ).toBeNull();
    expect(criteriaFieldOf(null)).toBeNull();
  });
});
