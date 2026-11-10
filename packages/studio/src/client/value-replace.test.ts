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
  keyedDetails,
  matchSentence,
  NO_OPT_INS,
  notSentEntries,
  outcomeRows,
  outcomeView,
  overlapNote,
  pinnedAndProtectedTotal,
  previewParams,
  protectedTotal,
  reasonLabel,
  replacedCount,
  statusNote,
  statusTone,
  valueCount,
  withGroupedNumbers,
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
    expect(isSendable(entry("p", "pinned"), NO_OPT_INS)).toBe(false);
    expect(isSendable(entry("q", "protected"), NO_OPT_INS)).toBe(false);
    expect(
      isSendable(entry("q", "protected"), { includePinned: true, includeProtected: false }),
    ).toBe(false);
    expect(isSendable(entry("p", "pinned"), { includePinned: false, includeProtected: true })).toBe(
      false,
    );
    expect(entriesToApply(preview([entry("p", "pinned")]), NO_OPT_INS)).toEqual([]);
  });

  it.each([
    [false, false, false],
    [true, false, false],
    [false, true, false],
    [true, true, true],
  ])(
    "sends a pinned key that is also protected only with both boxes (pinned %s, protected %s)",
    (includePinned, includeProtected, sent) => {
      const both = entry("pp", "pinned", { protected: true });

      expect(isSendable(both, { includePinned, includeProtected })).toBe(sent);
    },
  );

  it("still sends a pinned key that is not protected on the pinned box alone", () => {
    expect(isSendable(entry("p", "pinned"), { includePinned: true, includeProtected: false })).toBe(
      true,
    );
  });
});

describe("statusNote and protectedTotal", () => {
  it("says both boxes are needed for a pinned key that is also protected", () => {
    const both = entry("pp", "pinned", { protected: true });

    expect(statusNote(both, { includePinned: true, includeProtected: false })).toBe(
      "This pinned value was written, imported, or changed by a person outside verbatra. It is left out unless you tick both boxes.",
    );
    expect(statusNote(both, { includePinned: true, includeProtected: true })).toBe(
      "This pinned value was written, imported, or changed by a person outside verbatra. It is included in this run because you ticked both boxes.",
    );
  });

  it("uses one comma style for every protected note", () => {
    expect(statusNote(entry("c", "protected"))).toBe(
      "A person wrote, imported, or changed this outside verbatra. Left out unless you opt in.",
    );
    expect(
      statusNote(entry("c", "protected"), { includePinned: false, includeProtected: true }),
    ).toBe(
      "A person wrote, imported, or changed this outside verbatra. Included in this run because you ticked its box.",
    );
  });

  it("keeps the plain pinned note for a pinned key that is not protected", () => {
    expect(
      statusNote(entry("p", "pinned"), { includePinned: true, includeProtected: false }),
    ).toContain("Included in this run because you ticked its box.");
  });

  it("counts only the values the protected box alone adds, and the overlap separately", () => {
    const counted = preview([
      entry("a", "pinned", { protected: true }),
      entry("b", "pinned"),
      entry("c", "protected"),
    ]);

    expect(protectedTotal(counted)).toBe(1);
    expect(pinnedAndProtectedTotal(counted)).toBe(1);
    expect(entriesToApply(counted, { includePinned: false, includeProtected: true })).toHaveLength(
      protectedTotal(counted),
    );
  });

  it("words the overlap line in the singular and the plural", () => {
    expect(overlapNote(1)).toBe(
      "1 pinned key was also written by a person: tick both boxes to change it.",
    );
    expect(overlapNote(1200)).toBe(
      "1,200 pinned keys were also written by a person: tick both boxes to change them.",
    );
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
      ["protected", 1, "Protected"],
    ]);
  });
});

describe("outcomeView", () => {
  const cases: readonly [ValueReplaceOutcome, string, string, RegExp][] = [
    [
      { locale: "de", key: "k", status: "applied", staleSource: false },
      "Replaced",
      "success",
      /^$/,
    ],
    [
      { locale: "de", key: "k", status: "applied", staleSource: true },
      "Replaced",
      "warning",
      /Still out of date/,
    ],
    [
      { locale: "de", key: "k", status: "skipped", reason: "locale-failed" },
      "Not attempted",
      "danger",
      /locale failed/,
    ],
    [
      { locale: "de", key: "k", status: "skipped", reason: "pinned" },
      "Skipped",
      "neutral",
      /pinned/,
    ],
    [
      { locale: "de", key: "k", status: "skipped", reason: "a-reason-from-a-newer-sdk" as never },
      "Skipped",
      "neutral",
      /^a-reason-from-a-newer-sdk$/,
    ],
    [
      { locale: "de", key: "k", status: "refused", reason: "placeholder" },
      "Refused",
      "danger",
      /a placeholder would change/,
    ],
    [
      { locale: "de", key: "k", status: "changed" },
      "Not changed",
      "warning",
      /changed since the preview/,
    ],
    [{ locale: "de", key: "k", status: "too-long" }, "Too long", "danger", /20,000 characters/],
  ];

  it.each(cases)("describes %j", (outcome, label, tone, note) => {
    const view = outcomeView(outcome);
    expect(view.label).toBe(label);
    expect(view.tone).toBe(tone);
    expect(view.note).toMatch(note);
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
    expect(valueCount(1000)).toBe("1,000 values");
    expect(valueCount(1_234_567)).toBe("1,234,567 values");
  });

  it("agrees the match verb with the count", () => {
    expect(matchSentence(1)).toBe("1 value matches.");
    expect(matchSentence(2)).toBe("2 values match.");
    expect(matchSentence(1000)).toBe("1,000 values match.");
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

describe("keyedDetails", () => {
  it("gives repeated detail lines distinct keys", () => {
    const keyed = keyedDetails(["{name} is missing", "{name} is missing", "other"]);

    expect(new Set(keyed.map((item) => item.key)).size).toBe(3);
    expect(keyed.map((item) => item.text)).toEqual([
      "{name} is missing",
      "{name} is missing",
      "other",
    ]);
  });
});

describe("notSentEntries", () => {
  it("lists every previewed entry the apply leaves out, by the opt-ins", () => {
    const all = preview([
      entry("ready", "ready"),
      entry("pinned", "pinned"),
      entry("protected", "protected"),
      entry("refused", "gate-refused"),
    ]);

    expect(notSentEntries(all, NO_OPT_INS).map((item) => item.key)).toEqual([
      "pinned",
      "protected",
      "refused",
    ]);
    expect(
      notSentEntries(all, { includePinned: true, includeProtected: true }).map((item) => item.key),
    ).toEqual(["refused"]);
  });
});

describe("withGroupedNumbers", () => {
  it("groups numbers of four digits or more and leaves the rest", () => {
    expect(withGroupedNumbers("must be 1 to 20000 characters, got 20001 (3)")).toBe(
      "must be 1 to 20,000 characters, got 20,001 (3)",
    );
  });
});
