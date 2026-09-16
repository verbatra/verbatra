import type {
  EstimateCaveatCode,
  LockWaitEvent,
  PricedRunEstimate,
  ProgressEvent,
  RunEstimate,
  UnpricedRunEstimate,
  WatchRunResult,
} from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import {
  renderCheckHuman,
  renderDiffHuman,
  renderError,
  renderExportHuman,
  renderHuman,
  renderLockWait,
  renderLockWaitHuman,
  renderLockWaitJson,
  renderProgress,
  renderProgressHuman,
  renderProgressJson,
  renderRunResultHuman,
  toRenderableError,
} from "./render.js";
import { makeLocale, makeSummary } from "./test-support.js";

describe("render: export result", () => {
  it("renders the path, one line per locale, and a total", () => {
    const text = renderExportHuman({
      path: "/p/wb.xlsx",
      locales: [
        { locale: "de", rows: 2 },
        { locale: "fr", rows: 3 },
      ],
    });
    expect(text).toContain("verbatra export -> /p/wb.xlsx");
    expect(text).toContain("de: 2 rows");
    expect(text).toContain("5 rows across 2 locales");
  });
});

describe("render: check summary", () => {
  it("renders a header, per-locale counts with an in-sync marker, and an overall line", () => {
    const text = renderCheckHuman({
      inSync: false,
      locales: [
        { locale: "de", missing: 3, stale: 1, upToDate: 120, inSync: false },
        { locale: "fr", missing: 0, stale: 0, upToDate: 124, inSync: true },
      ],
    });
    expect(text).toContain("verbatra check");
    expect(text).toContain("de: 3 missing, 1 stale, 120 up-to-date (out of sync)");
    expect(text).toContain("fr: 0 missing, 0 stale, 124 up-to-date (in sync)");
    expect(text).toContain("out of sync (run verbatra translate to update)");
  });

  it("renders the all-in-sync overall line when every locale is in sync", () => {
    const text = renderCheckHuman({
      inSync: true,
      locales: [{ locale: "de", missing: 0, stale: 0, upToDate: 2, inSync: true }],
    });
    expect(text).toContain("all locales in sync");
    expect(text).not.toContain("out of sync");
  });
});

describe("render: check consistency report", () => {
  it("prints no consistency block when the report was not requested", () => {
    const text = renderCheckHuman({
      inSync: true,
      locales: [{ locale: "de", missing: 0, stale: 0, upToDate: 2, inSync: true }],
    });
    expect(text).not.toContain("consistency");
  });

  it("lists each group with its qualifiers, translations, and keys, and marks a clean locale", () => {
    const text = renderCheckHuman({
      inSync: true,
      locales: [
        {
          locale: "de",
          missing: 0,
          stale: 0,
          upToDate: 6,
          inSync: true,
          inconsistencies: [
            {
              source: "Open",
              context: "menu",
              description: "a file",
              meaning: "verb",
              isPlural: true,
              translations: [
                { value: "Aufmachen", keys: ["b"] },
                { value: "\u00d6ffnen", keys: ["a", "c"] },
              ],
            },
            {
              source: "Save",
              isPlural: false,
              translations: [
                { value: "Sichern", keys: ["d"] },
                { value: "Speichern", keys: ["e"] },
                { value: "Ablegen", keys: ["f"] },
              ],
            },
          ],
        },
        { locale: "fr", missing: 0, stale: 0, upToDate: 6, inSync: true, inconsistencies: [] },
      ],
    });
    expect(text.split("\n").slice(3)).toEqual([
      "all locales in sync",
      "consistency (report only, never changes the exit code)",
      "  de: 2 source strings translated more than one way",
      '    "Open" (context "menu", description "a file", meaning "verb", plural) is translated 2 ways:',
      '      "Aufmachen": b',
      '      "\u00d6ffnen": a, c',
      '    "Save" is translated 3 ways:',
      '      "Sichern": d',
      '      "Speichern": e',
      '      "Ablegen": f',
      "  fr: consistent",
    ]);
  });

  it("uses the singular noun for one group", () => {
    const text = renderCheckHuman({
      inSync: true,
      locales: [
        {
          locale: "de",
          missing: 0,
          stale: 0,
          upToDate: 2,
          inSync: true,
          inconsistencies: [
            {
              source: "Save",
              isPlural: false,
              translations: [
                { value: "Sichern", keys: ["a"] },
                { value: "Speichern", keys: ["b"] },
              ],
            },
          ],
        },
      ],
    });
    expect(text).toContain("  de: 1 source string translated more than one way");
  });

  it("folds control and format characters in untrusted text to spaces", () => {
    const text = renderCheckHuman({
      inSync: true,
      locales: [
        {
          locale: "de",
          missing: 0,
          stale: 0,
          upToDate: 2,
          inSync: true,
          inconsistencies: [
            {
              source: "Save\u001b[2J",
              isPlural: false,
              translations: [
                { value: "Sichern\nnow", keys: ["a\u200b"] },
                { value: "Speichern", keys: ["b"] },
              ],
            },
          ],
        },
      ],
    });
    expect(text).not.toContain("\u001b");
    expect(text).not.toContain("\u200b");
    expect(text).toContain('"Save [2J" is translated 2 ways:');
    expect(text).toContain('"Sichern now": a ');
  });

  it("names the plural form a group shares", () => {
    const text = renderCheckHuman({
      inSync: true,
      locales: [
        {
          locale: "ru",
          missing: 0,
          stale: 0,
          upToDate: 4,
          inSync: true,
          inconsistencies: [
            {
              source: "%d file",
              isPlural: true,
              pluralForm: "one",
              translations: [
                { value: "%d документ", keys: ["b_one"] },
                { value: "%d файл", keys: ["a_one"] },
              ],
            },
          ],
        },
      ],
    });
    expect(text).toContain('    "%d file" (plural form "one") is translated 2 ways:');
  });

  it("folds Unicode line and paragraph separators in untrusted text to spaces", () => {
    const text = renderCheckHuman({
      inSync: true,
      locales: [
        {
          locale: "de",
          missing: 0,
          stale: 0,
          upToDate: 2,
          inSync: true,
          inconsistencies: [
            {
              source: "Save\u2028now",
              isPlural: false,
              translations: [
                { value: "Sichern\u2029jetzt", keys: ["a\u2028b"] },
                { value: "Speichern", keys: ["c"] },
              ],
            },
          ],
        },
      ],
    });
    expect(text).not.toMatch(/[\u2028\u2029]/);
    expect(text).toContain('"Save now" is translated 2 ways:');
    expect(text).toContain('"Sichern jetzt": a b');
  });
});

describe("render: diff summary", () => {
  it("renders a header, a per-locale count header, and the grouped key lists", () => {
    const text = renderDiffHuman({
      hasPendingChanges: true,
      locales: [
        {
          locale: "de",
          missing: ["app.title", "nav.home"],
          changed: ["footer.copyright"],
          orphaned: ["legacy.banner"],
          hasPendingChanges: true,
        },
      ],
    });
    expect(text).toContain("verbatra diff");
    expect(text).toContain("de: 2 to add, 1 to re-translate, 1 orphaned");
    expect(text).toContain("add:");
    expect(text).toContain("app.title, nav.home");
    expect(text).toContain("re-translate:");
    expect(text).toContain("footer.copyright");
    expect(text).toContain("orphaned:");
    expect(text).toContain("legacy.banner");
    expect(text).toContain("1 locale, pending changes");
  });

  it("omits empty groups and lists every key without truncation", () => {
    const many = Array.from({ length: 60 }, (_, i) => `k${i}`);
    const text = renderDiffHuman({
      hasPendingChanges: true,
      locales: [
        { locale: "de", missing: many, changed: [], orphaned: [], hasPendingChanges: true },
      ],
    });
    expect(text).toContain("de: 60 to add, 0 to re-translate, 0 orphaned");
    expect(text).toContain("add:");
    expect(text).not.toContain("re-translate:");
    expect(text).not.toContain("orphaned:");
    for (const key of many) {
      expect(text).toContain(key);
    }
  });

  it("collapses a locale with no missing, changed, or orphaned keys to one line", () => {
    const text = renderDiffHuman({
      hasPendingChanges: false,
      locales: [{ locale: "fr", missing: [], changed: [], orphaned: [], hasPendingChanges: false }],
    });
    expect(text).toContain("fr: no pending changes");
    expect(text).toContain("1 locale, no pending changes");
    expect(text).not.toContain("add:");
  });

  it("shows orphaned-only locales without collapsing and trailer stays no pending changes", () => {
    const text = renderDiffHuman({
      hasPendingChanges: false,
      locales: [
        {
          locale: "de",
          missing: [],
          changed: [],
          orphaned: ["legacy.banner"],
          hasPendingChanges: false,
        },
      ],
    });
    expect(text).toContain("de: 0 to add, 0 to re-translate, 1 orphaned");
    expect(text).toContain("orphaned:");
    expect(text).toContain("legacy.banner");
    expect(text).toContain("1 locale, no pending changes");
  });
});

describe("render: import reuses the summary formatter with an import header", () => {
  it("uses the import command label in the header", () => {
    const text = renderHuman(makeSummary({ locales: [makeLocale()] }), "import");
    expect(text).toContain("verbatra import");
  });
});

describe("render: human run summary", () => {
  it("renders one line per locale plus an aggregate", () => {
    const summary = makeSummary({
      locales: [makeLocale({ locale: "de", translated: ["a", "b"], unchanged: ["c"] })],
      succeeded: ["de"],
    });
    const text = renderHuman(summary);
    expect(text).toContain("de: 2 translated, 1 unchanged");
    expect(text).toContain("1 succeeded, 0 partial, 0 failed");
    expect(text).not.toContain("dry run");
  });

  it("marks a dry run and shows nothing-written in the aggregate", () => {
    const text = renderHuman(makeSummary({ dryRun: true }));
    expect(text).toContain("(dry run)");
    expect(text).toContain("dry run: nothing written");
  });

  it("shows optional counts only when non-zero", () => {
    const text = renderHuman(
      makeSummary({
        locales: [makeLocale({ orphaned: ["x"], notices: [], integrityMismatches: ["y"] })],
      }),
    );
    expect(text).toContain("1 orphaned");
    expect(text).toContain("1 integrity-withheld");
    expect(text).not.toContain("notices");
    expect(text).not.toContain("pruned");
  });

  it("shows the needs-review count when the run flagged keys for review", () => {
    const text = renderHuman(
      makeSummary({
        locales: [
          makeLocale({
            translated: ["a"],
            needsReview: [{ key: "a", reasons: ["EQUALS_SOURCE"] }],
          }),
        ],
      }),
    );
    expect(text).toContain("1 needs-review");
  });

  it("omits the needs-review count when nothing was flagged", () => {
    const text = renderHuman(makeSummary({ locales: [makeLocale({ translated: ["a"] })] }));
    expect(text).not.toContain("needs-review");
  });

  it("shows the from-cache count when keys were served from the translation memory", () => {
    const text = renderHuman(
      makeSummary({
        locales: [makeLocale({ translated: ["a"], cacheHits: ["b", "c"] })],
      }),
    );
    expect(text).toContain("2 from cache");
  });

  it("omits the from-cache count when nothing was served from the cache", () => {
    const text = renderHuman(makeSummary({ locales: [makeLocale({ translated: ["a"] })] }));
    expect(text).not.toContain("from cache");
  });

  it("counts a fuzzy reuse apart from an exact cache hit", () => {
    const text = renderHuman(
      makeSummary({
        locales: [
          makeLocale({
            cacheHits: ["b"],
            fuzzyHits: [{ key: "a", previousSource: "Save it", similarity: 0.93 }],
          }),
        ],
      }),
    );

    expect(text).toContain("1 from cache");
    expect(text).toContain("1 fuzzy-reused");
  });

  it("names the key, the score and the source each fuzzy reuse came from", () => {
    const text = renderHuman(
      makeSummary({
        locales: [
          makeLocale({
            fuzzyHits: [
              { key: "cart.empty", previousSource: "Your cart is empty", similarity: 0.94 },
            ],
          }),
        ],
      }),
    );

    expect(text).toContain('cart.empty (94% like "Your cart is empty")');
  });

  it("shortens a long previous source rather than printing the whole string", () => {
    const long = "Your subscription renews automatically at the end of each billing period.";
    const text = renderHuman(
      makeSummary({
        locales: [makeLocale({ fuzzyHits: [{ key: "a", previousSource: long, similarity: 1 }] })],
      }),
    );

    expect(text).not.toContain(long);
    expect(text).toContain("Your subscription renews");
    expect(text).toContain("...");
  });

  it("neutralizes control characters in the source it echoes back", () => {
    const text = renderHuman(
      makeSummary({
        locales: [
          makeLocale({
            fuzzyHits: [{ key: "a", previousSource: "\u001b[31mred\nline\ttab", similarity: 0.95 }],
          }),
        ],
      }),
    );

    expect(text).toContain('a (95% like " [31mred line tab")');
    expect(text).not.toContain("\u001b[31m");
  });

  it("counts a surrogate pair as one character rather than splitting it", () => {
    const flags = "\u{1f1e9}\u{1f1ea}".repeat(30);
    const text = renderHuman(
      makeSummary({
        locales: [makeLocale({ fuzzyHits: [{ key: "a", previousSource: flags, similarity: 1 }] })],
      }),
    );

    expect(text).not.toContain("\ufffd");
    expect(text).toContain("...");
  });

  it("omits the fuzzy-reused count when nothing was reused", () => {
    const text = renderHuman(makeSummary({ locales: [makeLocale({ translated: ["a"] })] }));

    expect(text).not.toContain("fuzzy-reused");
  });

  it("shows the generated count when plural forms were synthesized", () => {
    const text = renderHuman(
      makeSummary({
        locales: [makeLocale({ translated: ["a"], generated: ["items_few", "items_many"] })],
      }),
    );
    expect(text).toContain("2 generated");
  });

  it("omits the generated count when nothing was generated", () => {
    const text = renderHuman(makeSummary({ locales: [makeLocale({ translated: ["a"] })] }));
    expect(text).not.toContain("generated");
  });

  it("shows the pruned count when keys were pruned", () => {
    const text = renderHuman(
      makeSummary({
        locales: [makeLocale({ orphaned: ["x", "y"], pruned: ["x", "y"] })],
      }),
    );
    expect(text).toContain("2 orphaned");
    expect(text).toContain("2 pruned");
  });

  it("shows an unfilled count and the key list for changed rows left blank on import", () => {
    const text = renderHuman(
      makeSummary({ locales: [makeLocale({ unfilled: ["greeting", "farewell"] })] }),
      "import",
    );
    expect(text).toContain("2 unfilled");
    expect(text).toContain("unfilled:");
    expect(text).toContain("greeting, farewell");
  });

  it("shows a malformed-rows count and the row and column of each malformed row", () => {
    const text = renderHuman(
      makeSummary({ locales: [makeLocale({ malformedRows: [{ row: 7, column: "Status" }] })] }),
      "import",
    );
    expect(text).toContain("1 malformed-rows");
    expect(text).toContain("malformed:");
    expect(text).toContain("row 7 (Status)");
  });

  it("labels the record number and the file line of a malformed row that reports both", () => {
    const text = renderHuman(
      makeSummary({
        locales: [makeLocale({ malformedRows: [{ row: 7, line: 11, column: "Status" }] })],
      }),
      "import",
    );
    expect(text).toContain("row 7, line 11 (Status)");
  });

  it("shows a duplicate-keys count and the conflicting key with its losing row", () => {
    const text = renderHuman(
      makeSummary({ locales: [makeLocale({ duplicateKeys: [{ key: "greeting", row: 9 }] })] }),
      "import",
    );
    expect(text).toContain("1 duplicate-keys");
    expect(text).toContain("duplicates:");
    expect(text).toContain("greeting (row 9)");
  });

  it("labels the record number and the file line of a duplicate key that reports both", () => {
    const text = renderHuman(
      makeSummary({
        locales: [makeLocale({ duplicateKeys: [{ key: "greeting", row: 9, line: 14 }] })],
      }),
      "import",
    );
    expect(text).toContain("greeting (row 9, line 14)");
  });

  it("omits the import detail groups when nothing was unfilled, malformed, or duplicated", () => {
    const text = renderHuman(makeSummary({ locales: [makeLocale({ translated: ["a"] })] }));
    expect(text).not.toContain("unfilled");
    expect(text).not.toContain("malformed");
    expect(text).not.toContain("duplicates");
  });

  it("renders a failed locale with its structured code and message", () => {
    const text = renderHuman(
      makeSummary({
        locales: [
          makeLocale({
            locale: "fr",
            status: "failed",
            error: { code: "LOCALE_FAILED", message: "boom" },
          }),
        ],
        failed: ["fr"],
      }),
    );
    expect(text).toContain("fr: failed [LOCALE_FAILED] boom");
  });

  it("renders a failed locale without an error object (no bracketed suffix)", () => {
    const text = renderHuman(
      makeSummary({ locales: [makeLocale({ locale: "fr", status: "failed" })], failed: ["fr"] }),
    );
    expect(text).toContain("fr: failed");
    expect(text).not.toContain("[");
  });

  it("names the cause of a locale that failed with withheld keys and no error object", () => {
    const text = renderHuman(
      makeSummary({
        locales: [
          makeLocale({
            status: "failed",
            unchanged: ["farewell", "greeting"],
            providerFailures: ["welcome"],
            notices: [
              {
                code: "SUB_BATCH_FAILED",
                message:
                  "A sub-batch of 1 entries failed (RATE_LIMITED: rate-limited) and was withheld; it will be retried next run.",
              },
            ],
          }),
        ],
        failed: ["de"],
      }),
    );

    expect(text).toContain("de: failed");
    expect(text).toContain("provider-failed:");
    expect(text).toContain("welcome");
    expect(text).toContain("[SUB_BATCH_FAILED]");
    expect(text).toContain("RATE_LIMITED");
  });

  it("counts provider-failed keys on a partial locale and lists them under it", () => {
    const text = renderHuman(
      makeSummary({
        locales: [
          makeLocale({
            status: "partial",
            translated: ["alpha"],
            providerFailures: ["welcome"],
          }),
        ],
        partial: ["de"],
      }),
    );

    expect(text).toContain("1 provider-failed");
    expect(text).toContain("provider-failed: welcome");
  });

  it("adds no detail group for a locale with no provider failures and no notices", () => {
    const text = renderHuman(
      makeSummary({ locales: [makeLocale({ translated: ["a"] })], succeeded: ["de"] }),
    );

    expect(text).not.toContain("provider-failed");
    expect(text).not.toContain("notices");
  });

  it("shows the budget-withheld count only when non-zero", () => {
    const withheld = renderHuman(
      makeSummary({ locales: [makeLocale({ budgetWithheld: ["a", "b"] })] }),
    );
    expect(withheld).toContain("2 budget-withheld");

    const none = renderHuman(makeSummary({ locales: [makeLocale()] }));
    expect(none).not.toContain("budget-withheld");
  });

  it("shows per-locale token counts when usage is present, and omits them when absent", () => {
    const withUsage = renderHuman(
      makeSummary({
        locales: [makeLocale({ usage: { inputTokens: 100, outputTokens: 50 } })],
      }),
    );
    expect(withUsage).toContain("150 tokens (100 in, 50 out)");

    const withoutUsage = renderHuman(makeSummary({ locales: [makeLocale()] }));
    expect(withoutUsage).not.toContain("tokens");
  });

  it("shows a run-aggregate token line when RunSummary.usage is defined", () => {
    const text = renderHuman(
      makeSummary({
        locales: [makeLocale({ usage: { inputTokens: 100, outputTokens: 50 } })],
        usage: { inputTokens: 100, outputTokens: 50 },
      }),
    );
    expect(text).toContain("total: 150 tokens (100 in, 50 out)");
  });

  it("omits the run-aggregate token line when RunSummary.usage is absent", () => {
    const text = renderHuman(makeSummary({ locales: [makeLocale()] }));
    expect(text).not.toContain("total:");
  });

  it("shows a budget line with the ceiling, tokens used, and exceeded status", () => {
    const exceeded = renderHuman(
      makeSummary({
        budget: {
          maxTokens: 1000,
          behavior: "stop",
          supported: true,
          tokensUsed: 1200,
          exceeded: true,
        },
      }),
    );
    expect(exceeded).toContain("budget: 1200/1000 tokens (stop), exceeded");

    const withinBudget = renderHuman(
      makeSummary({
        budget: {
          maxTokens: 1000,
          behavior: "warn",
          supported: true,
          tokensUsed: 200,
          exceeded: false,
        },
      }),
    );
    expect(withinBudget).toContain("budget: 200/1000 tokens (warn), within budget");
  });

  it("counts an estimated budget and blames the count, not the provider, for the estimate", () => {
    const text = renderHuman(
      makeSummary({
        budget: {
          maxTokens: 500,
          behavior: "stop",
          supported: false,
          tokensUsed: 394,
          exceeded: false,
        },
      }),
    );
    expect(text).toContain(
      "budget: 394/500 tokens (stop), within budget, estimated (not every request reported usage)",
    );
    expect(text).not.toContain("not supported by this provider");
  });

  it("omits the estimated marker when the run counted nothing at all", () => {
    const text = renderHuman(
      makeSummary({
        budget: {
          maxTokens: 500,
          behavior: "warn",
          supported: false,
          tokensUsed: 0,
          exceeded: false,
        },
      }),
    );
    expect(text).toContain("budget: 0/500 tokens (warn), within budget");
    expect(text).not.toContain("estimated");
  });

  it("marks a provider-reported count as reported rather than estimated", () => {
    const text = renderHuman(
      makeSummary({
        budget: {
          maxTokens: 500,
          behavior: "stop",
          supported: true,
          tokensUsed: 394,
          exceeded: false,
        },
      }),
    );
    expect(text).toContain("budget: 394/500 tokens (stop), within budget");
    expect(text).not.toContain("estimated");
  });

  it("omits the budget line entirely when no budget is configured", () => {
    const text = renderHuman(makeSummary({ locales: [makeLocale()] }));
    expect(text).not.toContain("budget:");
  });
});

describe("render: errors", () => {
  it("renderError is a one-line structured message, never a stack", () => {
    expect(renderError({ code: "CONFIG_INVALID", message: "bad" })).toBe(
      "verbatra: error [CONFIG_INVALID] bad",
    );
  });

  it("toRenderableError reads a coded Error, falls back for non-coded and non-Error", () => {
    const coded = Object.assign(new Error("m"), { code: "SOURCE_UNREADABLE" });
    expect(toRenderableError(coded)).toEqual({ code: "SOURCE_UNREADABLE", message: "m" });
    expect(toRenderableError(new Error("plain"))).toEqual({ code: "CLI_ERROR", message: "plain" });
    expect(toRenderableError("weird")).toEqual({ code: "CLI_ERROR", message: "weird" });
  });
});

describe("render: lock-wait progress", () => {
  it("human line names the path, holder pid and time, waited seconds, and the delete hint", () => {
    const event: LockWaitEvent = {
      lockPath: "/proj/.verbatra-local/locks/de.lock",
      elapsedMs: 2_400,
      holder: { pid: 4321, acquiredAt: "2026-07-18T00:00:00.000Z" },
    };
    const line = renderLockWaitHuman(event);
    expect(line).toContain("/proj/.verbatra-local/locks/de.lock");
    expect(line).toContain("held by pid 4321 since 2026-07-18T00:00:00.000Z");
    expect(line).toContain("waited 2s");
    expect(line).toContain("can be deleted");
  });

  it("human line omits the held-by clause when no holder is known", () => {
    const line = renderLockWaitHuman({ lockPath: "/x/de.lock", elapsedMs: 0 });
    expect(line).not.toContain("held");
    expect(line).toContain("/x/de.lock");
  });

  it("human line shows only the pid, or only the time, when the holder is partial", () => {
    const pidOnly = renderLockWaitHuman({
      lockPath: "/x/de.lock",
      elapsedMs: 0,
      holder: { pid: 7 },
    });
    expect(pidOnly).toContain("held by pid 7)");
    const timeOnly = renderLockWaitHuman({
      lockPath: "/x/de.lock",
      elapsedMs: 0,
      holder: { acquiredAt: "2026-07-18T00:00:00.000Z" },
    });
    expect(timeOnly).toContain("held since 2026-07-18T00:00:00.000Z)");
  });

  it("json record is a single object tagged lock-wait carrying the event fields", () => {
    const event: LockWaitEvent = {
      lockPath: "/x/de.lock",
      elapsedMs: 1_000,
      holder: { pid: 9 },
    };
    expect(JSON.parse(renderLockWaitJson(event))).toEqual({ type: "lock-wait", ...event });
  });

  it("renderLockWait dispatches to JSON under json mode and to the human line otherwise", () => {
    const event: LockWaitEvent = { lockPath: "/x/de.lock", elapsedMs: 0 };
    expect(JSON.parse(renderLockWait(event, true))).toMatchObject({ type: "lock-wait" });
    expect(renderLockWait(event, false)).toContain("waiting for the write lock");
  });
});

describe("render: progress", () => {
  const cases: ReadonlyArray<readonly [ProgressEvent, string]> = [
    [{ type: "locale-started", locale: "de", localeIndex: 0, totalLocales: 3 }, "translating de"],
    [{ type: "sub-batch", locale: "de", batchIndex: 2, totalBatches: 4 }, "de batch 2/4"],
    [
      { type: "locale-finished", locale: "de", translated: 5, localeIndex: 0, totalLocales: 3 },
      "de done, 5 translated",
    ],
    [{ type: "run-finished", localesCompleted: 3 }, "run finished, 3 locales processed"],
  ];

  it("renders every event type human-readably, prefixed with verbatra:", () => {
    for (const [event, fragment] of cases) {
      const line = renderProgressHuman(event);
      expect(line.startsWith("verbatra:")).toBe(true);
      expect(line).toContain(fragment);
    }
  });

  it("renders every event type as its verbatim JSON record", () => {
    for (const [event] of cases) {
      expect(JSON.parse(renderProgressJson(event))).toEqual(event);
    }
  });

  it("renderProgress dispatches to JSON under json mode and to the human line otherwise", () => {
    const event: ProgressEvent = { type: "run-finished", localesCompleted: 1 };
    expect(JSON.parse(renderProgress(event, true))).toEqual(event);
    expect(renderProgress(event, false)).toContain("run finished");
  });
});

describe("render: watch run result", () => {
  it("renders the summary on success and the one-line error on failure", () => {
    const ok: WatchRunResult = { status: "succeeded", summary: makeSummary({ succeeded: ["de"] }) };
    const bad: WatchRunResult = {
      status: "failed",
      error: { code: "SOURCE_INVALID", message: "x" },
    };
    expect(renderRunResultHuman(ok)).toContain("1 succeeded");
    expect(renderRunResultHuman(bad)).toBe("verbatra: error [SOURCE_INVALID] x");
  });
});

describe("renderHuman: pre-run estimate", () => {
  const tokenEstimate: PricedRunEstimate = {
    provider: "anthropic",
    model: "sonnet-test",
    rateKey: "anthropic/sonnet-test",
    unit: "tokens",
    pricing: "priced",
    currency: "USD",
    asOf: "2026-01-15",
    locales: [
      {
        locale: "de",
        keys: 400,
        requests: 8,
        inputTokens: 10800,
        outputTokens: 7600,
        cost: 0.1464,
      },
    ],
    keys: 400,
    requests: 8,
    inputTokens: 10800,
    outputTokens: 7600,
    cost: 0.1464,
    caveats: ["CACHE_NOT_CONSULTED", "SOURCE_DUPLICATES_NOT_DEDUPLICATED"],
  };

  function render(estimate: RunEstimate): string {
    return renderHuman(makeSummary({ dryRun: true, estimate }));
  }

  function unpriced(pricing: UnpricedRunEstimate["pricing"]): UnpricedRunEstimate {
    const { currency: _currency, asOf: _asOf, cost: _cost, locales, ...rest } = tokenEstimate;
    return {
      ...rest,
      pricing,
      locales: locales.map(({ cost: _localeCost, ...locale }) => locale),
    };
  }

  it("reports keys, requests, and the token split for a token-billed provider", () => {
    expect(render(tokenEstimate)).toContain(
      "estimate: 400 keys in 8 requests, ~10800 input + ~7600 output tokens",
    );
  });

  it("prints the currency code and the date the rates were read beside every figure", () => {
    const line = render(tokenEstimate);
    expect(line).toContain("0.1464 USD");
    expect(line).toContain("rates as of 2026-01-15");
  });

  it("calls the figure an estimate rather than a price", () => {
    expect(render(tokenEstimate)).toContain("estimate");
    expect(render(tokenEstimate)).not.toContain("total cost:");
  });

  it("names what the figure leaves out, so it is not read as a bill", () => {
    const line = render(tokenEstimate);
    expect(line).toContain("cache hits");
    expect(line).toContain("duplicate source strings");
  });

  it("reports source characters and no token figure for a character-billed provider", () => {
    const { inputTokens: _in, outputTokens: _out, ...rest } = tokenEstimate;
    const line = render({
      ...rest,
      provider: "deepl",
      rateKey: "deepl",
      unit: "characters",
      sourceCharacters: 16000,
      locales: [{ locale: "de", keys: 400, requests: 8, sourceCharacters: 16000, cost: 0.1464 }],
    });

    expect(line).toContain("~16000 source characters");
    expect(line).not.toContain("tokens");
  });

  it("says which rate is missing and where to add it, rather than showing zero", () => {
    const line = render(unpriced("no-rate-on-file"));

    expect(line).toContain("no rate on file for anthropic/sonnet-test");
    expect(line).toContain('rates.table["anthropic/sonnet-test"]');
    expect(line).not.toContain("0.00");
  });

  it("refuses a rate written in the wrong unit rather than applying it", () => {
    const line = render(unpriced("rate-unit-mismatch"));

    expect(line).toContain("is not priced in tokens");
  });

  it("reports a self-hosted endpoint as carrying no API cost", () => {
    const line = render({
      ...unpriced("not-billed"),
      provider: "openai-compatible",
      rateKey: "openai-compatible/llama-3",
    });

    expect(line).toContain("no API cost");
    expect(line).toContain("self-hosted");
  });

  it("never rounds a real cost down to a printed zero", () => {
    const line = render({ ...tokenEstimate, cost: 0.000022 });

    expect(line).toContain("less than 0.0001 USD");
    expect(line).not.toContain("0.0000 USD");
  });

  it("prints a genuinely costless run as zero, because that figure is accurate", () => {
    const line = render({
      ...tokenEstimate,
      keys: 0,
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      cost: 0,
      locales: [],
    });

    expect(line).toContain("0.0000 USD");
    expect(line).not.toContain("less than");
  });

  it("prints the exact figure once it is large enough to survive four decimals", () => {
    expect(render({ ...tokenEstimate, cost: 0.00005 })).toContain("0.0001 USD");
    expect(render({ ...tokenEstimate, cost: 0.0000499 })).toContain("less than 0.0001 USD");
  });

  it("leaves the estimate lines out of a run that did not ask for one", () => {
    expect(renderHuman(makeSummary({ dryRun: true }))).not.toContain("estimate:");
  });

  it("never leaks an undefined or a NaN into any branch of the estimate block", () => {
    const { inputTokens: _in, outputTokens: _out, ...unpricedIdentity } = unpriced("not-billed");
    const characterUnit: UnpricedRunEstimate = {
      ...unpricedIdentity,
      unit: "characters",
      sourceCharacters: 16000,
      locales: [{ locale: "de", keys: 400, requests: 8, sourceCharacters: 16000 }],
    };
    const branches: readonly RunEstimate[] = [
      tokenEstimate,
      unpriced("no-rate-on-file"),
      unpriced("rate-unit-mismatch"),
      unpriced("not-billed"),
      characterUnit,
    ];

    for (const branch of branches) {
      const line = render(branch);
      expect(line).not.toContain("undefined");
      expect(line).not.toContain("NaN");
      expect(line).not.toContain("null");
    }
  });

  it("spells out every caveat code in the union, so a new one cannot render as a blank", () => {
    const everyCaveat: Record<EstimateCaveatCode, true> = {
      CACHE_NOT_CONSULTED: true,
      SOURCE_DUPLICATES_NOT_DEDUPLICATED: true,
      TRANSPORT_RETRIES_NOT_COUNTED: true,
      TRANSLATION_LENGTH_IS_ESTIMATED: true,
      TOKEN_COUNT_IS_HEURISTIC: true,
      REPAIR_REQUESTS_NOT_COUNTED: true,
    };
    const codes = Object.keys(everyCaveat) as readonly EstimateCaveatCode[];

    for (const code of codes) {
      const line = render({ ...tokenEstimate, caveats: [code] });
      const phrase = line.split("estimate excludes: ")[1]?.split("\n")[0] ?? "";

      expect(phrase, code).not.toBe("");
      expect(phrase, code).not.toContain("undefined");
    }
  });

  it("joins the whole token-billed list into one readable line", () => {
    const line = render({
      ...tokenEstimate,
      caveats: [
        "CACHE_NOT_CONSULTED",
        "SOURCE_DUPLICATES_NOT_DEDUPLICATED",
        "TRANSPORT_RETRIES_NOT_COUNTED",
        "TRANSLATION_LENGTH_IS_ESTIMATED",
        "TOKEN_COUNT_IS_HEURISTIC",
        "REPAIR_REQUESTS_NOT_COUNTED",
      ],
    });

    expect(line).toContain(
      "estimate excludes: cache hits, duplicate source strings, provider-side retries, " +
        "translation length, tokenizer differences, repair requests",
    );
  });
});
