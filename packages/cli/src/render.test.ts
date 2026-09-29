import { join, resolve } from "node:path";
import process from "node:process";
import {
  type EstimateCaveatCode,
  errorHint,
  type LockWaitEvent,
  type PricedRunEstimate,
  type ProgressEvent,
  type RunEstimate,
  type UnpricedRunEstimate,
} from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import {
  displayPath,
  renderCheckHuman,
  renderDiffHuman,
  renderError,
  renderExportHuman,
  renderHuman,
  renderLockWait,
  renderLockWaitHuman,
  renderLockWaitJson,
  renderProgressHuman,
  renderProgressJson,
  renderPseudoHuman,
  renderTmxExportHuman,
  renderTmxImportHuman,
  renderTypesHuman,
  toRenderableError,
} from "./render.js";
import {
  makeExportTmxResult,
  makeImportTmxResult,
  makeLocale,
  makeSummary,
} from "./test-support.js";

describe("displayPath: paths relative to the working directory", () => {
  const base = resolve("/work/app");

  it.each([
    ["a file inside the base", join(base, "out", "wb.xlsx"), join("out", "wb.xlsx")],
    ["a file directly in the base", join(base, "wb.xlsx"), "wb.xlsx"],
    ["the base itself", base, base],
    ["a sibling directory", resolve("/work/other/wb.xlsx"), resolve("/work/other/wb.xlsx")],
    ["the parent directory", resolve("/work"), resolve("/work")],
    ["a relative path", "out/wb.xlsx", "out/wb.xlsx"],
  ])("renders %s as expected", (_label, path, expected) => {
    expect(displayPath(path, base)).toBe(expected);
  });

  it("keeps a name that merely starts with two dots inside the base", () => {
    expect(displayPath(join(base, "..cache"), base)).toBe("..cache");
  });

  it("returns the path unchanged when no base is given", () => {
    expect(displayPath(join(base, "wb.xlsx"), undefined)).toBe(join(base, "wb.xlsx"));
  });

  it("shortens every path-bearing human renderer when a base is given", () => {
    const inBase = (name: string): string => join(base, name);
    expect(renderExportHuman({ path: inBase("wb.xlsx"), locales: [] }, base)).toContain(
      "verbatra export -> wb.xlsx",
    );
    expect(renderTmxExportHuman(makeExportTmxResult({ path: inBase("m.tmx") }), base)).toContain(
      "verbatra tmx export -> m.tmx",
    );
    expect(renderTmxImportHuman(makeImportTmxResult({ file: inBase("in.tmx") }), base)).toContain(
      "verbatra tmx import <- in.tmx",
    );
    expect(
      renderPseudoHuman(
        {
          locale: "en-XA",
          entries: 1,
          transformed: 1,
          copied: [],
          written: true,
          path: inBase("p.json"),
        },
        base,
      ),
    ).toContain("  wrote p.json");
    expect(
      renderTypesHuman(
        {
          path: inBase("t.d.ts"),
          sourcePath: "locales/en.json",
          keys: 1,
          withArguments: 0,
          unresolved: [],
          excluded: [],
          plural: [],
          check: true,
          stale: true,
          missing: false,
          written: false,
        },
        base,
      ),
    ).toContain("  t.d.ts is out of date");
  });
});

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

  it("words a dry run's counts as what would happen, not what happened", () => {
    const locales = [makeLocale({ translated: ["a", "b"], pruned: ["old"], unchanged: ["c"] })];
    const translate = renderHuman(makeSummary({ dryRun: true, locales }));
    expect(translate).toContain("de: 2 would translate, 1 unchanged, 1 would prune");
    expect(translate).not.toContain("translated");
    const imported = renderHuman(makeSummary({ dryRun: true, locales }), "import");
    expect(imported).toContain("de: 2 would import, 1 unchanged, 1 would prune");
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

  it("neutralizes line and paragraph separators in the source it echoes back", () => {
    const text = renderHuman(
      makeSummary({
        locales: [
          makeLocale({
            fuzzyHits: [{ key: "a", previousSource: "Save\u2028now\u2029later", similarity: 0.95 }],
          }),
        ],
      }),
    );

    expect(text).toContain('a (95% like "Save now later")');
    expect(text).not.toMatch(/[\u2028\u2029]/);
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
    expect(text).toContain("1 malformed-row");
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
    expect(text).toContain("1 duplicate-key");
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

  it("shows the withheld count and each refused key with its reason and ICU arms", () => {
    const text = renderHuman(
      makeSummary({
        locales: [
          makeLocale({
            locale: "ru",
            status: "failed",
            integrityMismatches: ["files", "greeting"],
            integrityRefusals: [
              {
                key: "files",
                reason: "icu",
                details: ['{n} plural: missing arm "few" required by the target language'],
              },
              { key: "greeting", reason: "empty" },
            ],
          }),
        ],
        failed: ["ru"],
      }),
    );

    expect(text).toContain("ru: failed, 0 translated, 0 unchanged, 2 integrity-withheld");
    expect(text).toContain("    integrity-withheld:");
    expect(text).toContain(
      '      files: icu ({n} plural: missing arm "few" required by the target language)',
    );
    expect(text).toContain("      greeting: empty");
  });

  it("lists a withheld key the refusals do not cover beside the refused ones, in key order", () => {
    const text = renderHuman(
      makeSummary({
        locales: [
          makeLocale({
            locale: "ru",
            status: "partial",
            translated: ["a"],
            integrityMismatches: ["drifted", "files", "title"],
            integrityRefusals: [
              {
                key: "files",
                reason: "icu",
                details: ['{n} plural: missing arm "few" required by the target language'],
              },
              { key: "title", reason: "empty" },
            ],
          }),
        ],
        partial: ["ru"],
      }),
      "import",
    );

    expect(text).toContain(
      [
        "    integrity-withheld:",
        "      drifted: source changed since export",
        '      files: icu ({n} plural: missing arm "few" required by the target language)',
        "      title: empty",
      ].join("\n"),
    );
  });

  it("lists withheld keys without reasons when the summary carries none", () => {
    const text = renderHuman(
      makeSummary({
        locales: [makeLocale({ status: "partial", translated: ["a"], integrityMismatches: ["b"] })],
        partial: ["de"],
      }),
    );

    expect(text).toMatch(/integrity-withheld:\s+b/);
  });

  it("neutralizes control characters in a refused key and its details", () => {
    const text = renderHuman(
      makeSummary({
        locales: [
          makeLocale({
            status: "failed",
            integrityMismatches: ["a\u001b"],
            integrityRefusals: [{ key: "a\u001b", reason: "placeholder", details: ["+{x}\u0007"] }],
          }),
        ],
        failed: ["de"],
      }),
    );

    expect(text).toContain("      a : placeholder (+{x} )");
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
                  "A sub-batch of 1 entry failed (RATE_LIMITED: rate-limited) and was withheld; it will be retried next run.",
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

  it("says a stop run halted before its ceiling when a refused request left the count under it", () => {
    const text = renderHuman(
      makeSummary({
        budget: {
          maxTokens: 10000,
          behavior: "stop",
          supported: true,
          tokensUsed: 6000,
          exceeded: true,
        },
      }),
    );
    expect(text).toContain("budget: 6000/10000 tokens (stop), stopped before the ceiling");
    expect(text).not.toContain("exceeded");
  });

  it("keeps the estimated marker on a stop run that halted before its ceiling", () => {
    const text = renderHuman(
      makeSummary({
        budget: {
          maxTokens: 800,
          behavior: "stop",
          supported: false,
          tokensUsed: 794,
          exceeded: true,
        },
      }),
    );
    expect(text).toContain(
      "budget: 794/800 tokens (stop), stopped before the ceiling, estimated (not every request reported usage)",
    );
  });

  it("calls a count that landed exactly on the ceiling exceeded, since it reached it", () => {
    const text = renderHuman(
      makeSummary({
        budget: {
          maxTokens: 1000,
          behavior: "stop",
          supported: true,
          tokensUsed: 1000,
          exceeded: true,
        },
      }),
    );
    expect(text).toContain("budget: 1000/1000 tokens (stop), exceeded");
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

  it("toRenderableError names a file under the working directory by its relative path", () => {
    const inside = join(process.cwd(), "locales", "de.json");
    const error = Object.assign(
      new Error(`The file at ${inside} is bad; ${"/elsewhere/x.json"} too.`),
      {
        code: "SOURCE_INVALID",
      },
    );

    expect(toRenderableError(error).message).toBe(
      `The file at ${join("locales", "de.json")} is bad; /elsewhere/x.json too.`,
    );
  });

  it("toRenderableError reads a coded Error, falls back for non-coded and non-Error", () => {
    const coded = Object.assign(new Error("m"), { code: "SOURCE_UNREADABLE" });
    expect(toRenderableError(coded)).toEqual({
      code: "SOURCE_UNREADABLE",
      message: "m",
      hint: errorHint(coded),
    });
    expect(toRenderableError(new Error("plain"))).toEqual({ code: "CLI_ERROR", message: "plain" });
    expect(toRenderableError("weird")).toEqual({ code: "CLI_ERROR", message: "weird" });
  });

  it("carries the code of a wrapped cause and names it on the stderr line", () => {
    const cause = Object.assign(new Error("GEMINI_API_KEY is not set"), {
      code: "MISSING_API_KEY",
    });
    const wrapped = Object.assign(new Error("Failed to construct provider", { cause }), {
      code: "PROVIDER_CONSTRUCTION_FAILED",
    });
    const renderable = toRenderableError(wrapped);
    expect(renderable).toEqual({
      code: "PROVIDER_CONSTRUCTION_FAILED",
      message: "Failed to construct provider",
      causeCode: "MISSING_API_KEY",
      hint: errorHint(cause),
    });
    expect(renderError(renderable)).toBe(
      "verbatra: error [PROVIDER_CONSTRUCTION_FAILED] Failed to construct provider (cause: MISSING_API_KEY)",
    );
    expect(toRenderableError(new Error("m", { cause: new Error("uncoded") }))).toEqual({
      code: "CLI_ERROR",
      message: "m",
    });
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
    [{ type: "run-finished", localesCompleted: 1 }, "run finished, 1 locale processed"],
  ];

  it("renders every event type human-readably, prefixed with verbatra:", () => {
    for (const [event, fragment] of cases) {
      const line = renderProgressHuman(event) ?? "";
      expect(line.startsWith("verbatra:")).toBe(true);
      expect(line).toContain(fragment);
    }
  });

  it("renders every event type as its verbatim JSON record", () => {
    for (const [event] of cases) {
      expect(JSON.parse(renderProgressJson(event) ?? "")).toEqual(event);
    }
  });

  const laterEvents: readonly ProgressEvent[] = [
    { type: "locale-planned", locale: "de", keys: 3, batches: 1, cacheHits: 0 },
    { type: "batch-finished", locale: "de", batchIndex: 1, totalBatches: 1, durationMs: 5 },
    { type: "provider-retry", attempt: 2, delayMs: 250, status: 429 },
    { type: "repair", locale: "de", keys: 1 },
    { type: "split-retry", locale: "de", keys: 4 },
    { type: "writing", locale: "de" },
    { type: "change-detected", paths: ["/p/locales/en.json"] },
    { type: "idle" },
  ];

  it.each(laterEvents)(
    "renders no plain line and no JSON record for the finer-grained $type event",
    (event) => {
      expect(renderProgressHuman(event)).toBeUndefined();
      expect(renderProgressJson(event)).toBeUndefined();
    },
  );
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

  it("counts one key and one request in the singular", () => {
    expect(render({ ...tokenEstimate, keys: 1, requests: 1 })).toContain(
      "estimate: 1 key in 1 request,",
    );
  });

  it("reports a human-only project as spending nothing, not as a self-hosted endpoint", () => {
    const line = render({ ...unpriced("not-billed"), provider: "none", rateKey: "none" });

    expect(line).toContain("estimated spend: none, machine translation is disabled by policy");
    expect(line).not.toContain("self-hosted");
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
