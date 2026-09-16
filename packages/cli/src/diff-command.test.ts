import type { DiffSummary, UnusedKey, UnusedKeysScan } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import { JSON_ENVELOPE_VERSION } from "./json-envelope.js";
import { run } from "./run.js";
import { captureStreams, makeDiffSummary, parseEnvelope, recordingDeps } from "./test-support.js";

describe("run diff: SDK delegation, rendering, and exit codes", () => {
  it("delegates to diff with the resolved cwd and exits 0 when nothing is pending", async () => {
    const summary = makeDiffSummary({
      hasPendingChanges: false,
      locales: [{ locale: "de", missing: [], changed: [], orphaned: [], hasPendingChanges: false }],
    });
    const { deps, calls } = recordingDeps({ diff: async () => summary });
    const cap = captureStreams();

    const code = await run(["diff", "--cwd", "/proj"], deps, cap.streams);

    expect(code).toBe(0);
    expect(calls.diff).toHaveLength(1);
    expect(calls.diff[0]).toMatchObject({ cwd: "/proj" });
    expect(cap.out()).toContain("verbatra diff");
    expect(cap.out()).toContain("de: no pending changes");
    expect(cap.out()).toContain("1 locale, no pending changes");
  });

  it("exits 1 when a locale has missing or changed keys, still printing the report", async () => {
    const summary = makeDiffSummary({
      hasPendingChanges: true,
      locales: [
        {
          locale: "de",
          missing: ["app.title"],
          changed: ["footer.copyright"],
          orphaned: ["legacy.banner"],
          hasPendingChanges: true,
        },
        { locale: "fr", missing: [], changed: [], orphaned: [], hasPendingChanges: false },
      ],
    });
    const { deps } = recordingDeps({ diff: async () => summary });
    const cap = captureStreams();

    const code = await run(["diff"], deps, cap.streams);

    expect(code).toBe(1);
    expect(cap.out()).toContain("de: 1 to add, 1 to re-translate, 1 orphaned");
    expect(cap.out()).toContain("app.title");
    expect(cap.out()).toContain("footer.copyright");
    expect(cap.out()).toContain("legacy.banner");
    expect(cap.out()).toContain("fr: no pending changes");
  });

  it("exits 0 when only orphaned keys are present (orphaned alone is not pending)", async () => {
    const summary = makeDiffSummary({
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
    const { deps } = recordingDeps({ diff: async () => summary });
    const cap = captureStreams();

    const code = await run(["diff"], deps, cap.streams);

    expect(code).toBe(0);
    expect(cap.out()).toContain("de: 0 to add, 0 to re-translate, 1 orphaned");
    expect(cap.out()).toContain("legacy.banner");
  });

  it("parses --locales into the SDK call", async () => {
    const { deps, calls } = recordingDeps();
    const cap = captureStreams();

    await run(["diff", "--locales", "de, fr ,"], deps, cap.streams);

    expect(calls.diff[0]).toMatchObject({ locales: ["de", "fr"] });
  });

  it("--json prints the diff summary as one JSON line and nothing else on stdout", async () => {
    const summary = makeDiffSummary({
      hasPendingChanges: true,
      locales: [
        { locale: "de", missing: ["a"], changed: [], orphaned: [], hasPendingChanges: true },
      ],
    });
    const { deps } = recordingDeps({ diff: async () => summary });
    const cap = captureStreams();

    const code = await run(["diff", "--json"], deps, cap.streams);

    expect(code).toBe(1);
    expect(parseEnvelope(cap.out())).toEqual({
      ok: true,
      version: JSON_ENVELOPE_VERSION,
      command: "diff",
      result: summary,
    });
  });

  it("forwards --config to loadConfig", async () => {
    const { deps, calls } = recordingDeps();
    const cap = captureStreams();

    await run(["diff", "--config", "verbatra.config.ts"], deps, cap.streams);

    expect(calls.loadConfig[0]).toMatchObject({ configPath: "verbatra.config.ts" });
  });

  it("a whole-run error renders to stderr and exits 2 with clean stdout", async () => {
    const { deps } = recordingDeps({
      diff: async () => {
        throw Object.assign(new Error("bad source"), { code: "SOURCE_INVALID" });
      },
    });
    const cap = captureStreams();

    const code = await run(["diff"], deps, cap.streams);

    expect(code).toBe(2);
    expect(cap.err()).toContain("[SOURCE_INVALID]");
    expect(cap.out()).toBe("");
  });

  it("rejects an empty --locales list as a usage error: exit 2, stderr, clean stdout, no SDK call", async () => {
    const { deps, calls } = recordingDeps();
    const cap = captureStreams();

    const code = await run(["diff", "--locales", ""], deps, cap.streams);

    expect(code).toBe(2);
    expect(cap.err()).toContain("[INVALID_LOCALES]");
    expect(cap.out()).toBe("");
    expect(calls.diff).toHaveLength(0);
  });

  it("rejects a comma-only --locales list as a usage error", async () => {
    const { deps, calls } = recordingDeps();
    const cap = captureStreams();

    const code = await run(["diff", "--locales", ","], deps, cap.streams);

    expect(code).toBe(2);
    expect(cap.err()).toContain("[INVALID_LOCALES]");
    expect(cap.out()).toBe("");
    expect(calls.diff).toHaveLength(0);
  });

  it("passes an unknown but non-empty --locales through, and the SDK UNKNOWN_LOCALE exits 2", async () => {
    const { deps, calls } = recordingDeps({
      diff: async () => {
        throw Object.assign(new Error("Requested locale not in configured targets: fr."), {
          code: "UNKNOWN_LOCALE",
        });
      },
    });
    const cap = captureStreams();

    const code = await run(["diff", "--locales", "fr"], deps, cap.streams);

    expect(code).toBe(2);
    expect(calls.diff[0]).toMatchObject({ locales: ["fr"] });
    expect(cap.err()).toContain("[UNKNOWN_LOCALE]");
    expect(cap.out()).toBe("");
  });
});

function unusedScan(overrides: Partial<UnusedKeysScan> = {}): UnusedKeysScan {
  return {
    status: "complete",
    unreliableBecause: [],
    scannedFiles: 3,
    unused: [],
    possiblyDynamic: [],
    ignored: [],
    dynamicPrefixes: [],
    ...overrides,
  };
}

function keys(...names: readonly string[]): readonly UnusedKey[] {
  return names.map((key) => ({ key, catalogKey: key }));
}

function inSyncWith(unused: DiffSummary["unused"]): DiffSummary {
  return makeDiffSummary({
    hasPendingChanges: false,
    locales: [{ locale: "de", missing: [], changed: [], orphaned: [], hasPendingChanges: false }],
    ...(unused === undefined ? {} : { unused }),
  });
}

async function runUnused(summary: DiffSummary, ...extra: readonly string[]) {
  const { deps } = recordingDeps({ diff: async () => summary });
  const cap = captureStreams();
  const code = await run(["diff", "--unused", ...extra], deps, cap.streams);
  return { code, out: cap.out() };
}

describe("run diff --unused: the unused-key report", () => {
  it("does not ask the SDK for the report unless --unused is given", async () => {
    const { deps, calls } = recordingDeps();
    const cap = captureStreams();

    await run(["diff"], deps, cap.streams);

    expect(calls.diff[0]).not.toHaveProperty("unused");
  });

  it("asks the SDK for the report with --unused", async () => {
    const { deps, calls } = recordingDeps();
    const cap = captureStreams();

    await run(["diff", "--unused"], deps, cap.streams);

    expect(calls.diff[0]).toMatchObject({ unused: true });
  });

  it("exits 1 when a complete scan finds unused keys, listing their decoded spelling", async () => {
    const { code, out } = await runUnused(
      inSyncWith(
        unusedScan({
          unused: [
            { key: "legacy.banner", catalogKey: "legacy.banner" },
            { key: "Welcome. Enjoy", catalogKey: "Welcome\\. Enjoy" },
          ],
        }),
      ),
    );

    expect(code).toBe(1);
    expect(out).toContain(
      "unused source keys: complete, 2 unused, 0 possibly dynamic, 0 ignored, 3 files scanned",
    );
    expect(out).toContain("unused (2):\n    legacy.banner\n    Welcome. Enjoy");
    expect(out).not.toContain("Welcome\\.");
    expect(out).toContain("de: no pending changes");
  });

  it("exits 0 when a complete scan finds only possibly dynamic keys, naming their prefix", async () => {
    const { code, out } = await runUnused(
      inSyncWith(
        unusedScan({
          possiblyDynamic: [{ key: "nav.home", catalogKey: "nav.home", prefix: "nav." }],
          dynamicPrefixes: [{ prefix: "nav.", file: "src/nav.ts", line: 3 }],
        }),
      ),
    );

    expect(code).toBe(0);
    expect(out).toContain("possibly dynamic (1):\n    nav.home  (prefix nav.)");
  });

  it("exits 0 when a complete scan finds only ignored keys, still naming them", async () => {
    const { code, out } = await runUnused(
      inSyncWith(unusedScan({ ignored: keys("emails.welcome") })),
    );

    expect(code).toBe(0);
    expect(out).toContain("ignored (1):\n    emails.welcome");
  });

  it("exits 0 on an unreliable scan, naming every reason with its sites", async () => {
    const { code, out } = await runUnused(
      inSyncWith(
        unusedScan({
          status: "unreliable",
          unreliableBecause: [
            { reason: "dynamic-keys", count: 1, sites: [{ file: "src/errors.ts", line: 4 }] },
            {
              reason: "translate-function-escapes",
              count: 1,
              sites: [{ file: "src/row.tsx", line: 7 }],
            },
            {
              reason: "template-files-not-scanned",
              count: 25,
              sites: Array.from({ length: 20 }, (_, index) => ({ file: `src/p${index}.vue` })),
            },
            {
              reason: "incomplete-scan",
              count: 1,
              sites: [{ file: "src/broken.ts", detail: "unparseable" }],
            },
          ],
          unused: keys("errors.notFound"),
        }),
      ),
    );

    expect(code).toBe(0);
    expect(out).toContain("unused source keys: unreliable, 1 unused");
    expect(out).toContain("unreliable: a key listed as unused may still be in use");
    expect(out).toContain("dynamic-keys (1):\n      src/errors.ts:4");
    expect(out).toContain("translate-function-escapes (1):\n      src/row.tsx:7");
    expect(out).toContain("template-files-not-scanned (25):\n      src/p0.vue");
    expect(out).toContain("      src/p9.vue\n      and 15 more");
    expect(out).toContain("incomplete-scan (1):\n      src/broken.ts  unparseable");
  });

  it("exits 0 and says it could not run when there was nothing to scan", async () => {
    const { code, out } = await runUnused(
      inSyncWith({
        status: "not-run",
        reason: "EXTRACT_NOT_CONFIGURED",
        message: "No extract block is configured.",
      }),
    );

    expect(code).toBe(0);
    expect(out).toContain(
      "unused source keys: not run [EXTRACT_NOT_CONFIGURED] No extract block is configured.",
    );
  });

  it("still exits 1 for pending changes when the unused-key scan could not run", async () => {
    const summary = makeDiffSummary({
      hasPendingChanges: true,
      locales: [
        { locale: "de", missing: ["a"], changed: [], orphaned: [], hasPendingChanges: true },
      ],
      unused: { status: "not-run", reason: "NO_SOURCE_FILES", message: "nothing scanned" },
    });

    expect((await runUnused(summary)).code).toBe(1);
  });

  it("--json carries the whole report inside the same diff envelope", async () => {
    const summary = inSyncWith(
      unusedScan({
        unused: [{ key: "Welcome. Enjoy", catalogKey: "Welcome\\. Enjoy" }],
        possiblyDynamic: [{ key: "nav.home", catalogKey: "nav.home", prefix: "nav." }],
      }),
    );

    const { code, out } = await runUnused(summary, "--json");

    expect(code).toBe(1);
    expect(parseEnvelope(out)).toEqual({
      ok: true,
      version: JSON_ENVELOPE_VERSION,
      command: "diff",
      result: summary,
    });
  });
});
