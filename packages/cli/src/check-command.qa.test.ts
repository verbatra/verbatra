import type { CheckSummary, LocaleQaReport } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import { run } from "./run.js";
import { captureStreams, makeCheckSummary, parseEnvelope, recordingDeps } from "./test-support.js";

const CLEAN: LocaleQaReport = { checked: 3, errors: 0, warnings: 0, findings: [] };

function qaSummary(
  de: LocaleQaReport,
  options: { readonly inSync?: boolean; readonly invalidSourceKeys?: readonly string[] } = {},
): CheckSummary {
  const inSync = options.inSync ?? true;
  return makeCheckSummary({
    inSync,
    locales: [{ locale: "de", missing: 0, stale: 0, upToDate: 3, inSync, qa: de }],
    qa: {
      errors: de.errors,
      warnings: de.warnings,
      invalidSourceKeys: options.invalidSourceKeys ?? [],
    },
  });
}

const BROKEN: LocaleQaReport = {
  checked: 3,
  errors: 1,
  warnings: 2,
  findings: [
    { key: "greeting", severity: "error", reason: "placeholder", details: ["-{{name}}"] },
    { key: "title", severity: "warning", reason: "EQUALS_SOURCE" },
    { key: "title", severity: "warning", reason: "LENGTH_RATIO_OUTLIER" },
  ],
};

const WARNED: LocaleQaReport = {
  checked: 3,
  errors: 0,
  warnings: 1,
  findings: [{ key: "title", severity: "warning", reason: "EQUALS_SOURCE" }],
};

describe("run check --qa: SDK delegation", () => {
  it("passes qa and the severity to the SDK", async () => {
    const { deps, calls } = recordingDeps({ check: async () => qaSummary(CLEAN) });
    const cap = captureStreams();

    const code = await run(["check", "--qa", "--severity", "error"], deps, cap.streams);

    expect(code).toBe(0);
    expect(calls.check[0]).toMatchObject({ qa: true, qaSeverity: "error" });
  });

  it("leaves qa out of the SDK call without --qa", async () => {
    const { deps, calls } = recordingDeps();
    const cap = captureStreams();

    await run(["check"], deps, cap.streams);

    expect(calls.check[0]).not.toHaveProperty("qa");
    expect(calls.check[0]).not.toHaveProperty("qaSeverity");
  });

  it.each([
    [["--severity", "warning"], "--severity"],
    [["--strict"], "--strict"],
  ])("rejects %j without --qa as a usage error", async (flags, named) => {
    const { deps, calls } = recordingDeps();
    const cap = captureStreams();

    const code = await run(["check", ...flags], deps, cap.streams);

    expect(code).toBe(2);
    expect(cap.err()).toContain("[INVALID_QA_OPTION]");
    expect(cap.err()).toContain(named);
    expect(calls.check).toHaveLength(0);
  });

  it("rejects --strict together with --severity error, which could never fail on a warning", async () => {
    const { deps, calls } = recordingDeps();
    const cap = captureStreams();

    const code = await run(["check", "--qa", "--strict", "--severity", "error"], deps, cap.streams);

    expect(code).toBe(2);
    expect(cap.err()).toContain("[INVALID_QA_OPTION]");
    expect(calls.check).toHaveLength(0);
  });

  it("rejects an unknown severity as a usage error, in the JSON envelope too", async () => {
    const { deps, calls } = recordingDeps();
    const cap = captureStreams();

    const code = await run(["check", "--qa", "--severity", "info", "--json"], deps, cap.streams);

    expect(code).toBe(2);
    expect(parseEnvelope(cap.out())).toMatchObject({ ok: false, code: "INVALID_SEVERITY" });
    expect(calls.check).toHaveLength(0);
  });
});

describe("run check --qa: exit codes", () => {
  it("exits 1 on a quality-check error even when every locale is in sync", async () => {
    const { deps } = recordingDeps({ check: async () => qaSummary(BROKEN) });
    const cap = captureStreams();

    expect(await run(["check", "--qa"], deps, cap.streams)).toBe(1);
  });

  it("exits 0 on warnings alone, and 1 with --strict", async () => {
    const { deps } = recordingDeps({ check: async () => qaSummary(WARNED) });

    expect(await run(["check", "--qa"], deps, captureStreams().streams)).toBe(0);
    expect(await run(["check", "--qa", "--strict"], deps, captureStreams().streams)).toBe(1);
  });

  it("still exits 1 on drift when the quality check is clean", async () => {
    const { deps } = recordingDeps({ check: async () => qaSummary(CLEAN, { inSync: false }) });

    expect(await run(["check", "--qa"], deps, captureStreams().streams)).toBe(1);
  });
});

describe("run check --qa: rendering", () => {
  it("groups findings per locale and key, with the details of an error", async () => {
    const { deps } = recordingDeps({ check: async () => qaSummary(BROKEN) });
    const cap = captureStreams();

    await run(["check", "--qa"], deps, cap.streams);

    expect(cap.out()).toContain("qa: 1 error, 2 warnings");
    expect(cap.out()).toContain("  de: 1 error, 2 warnings in 3 values checked");
    expect(cap.out()).toContain("    greeting: error placeholder (-{{name}})");
    expect(cap.out()).toContain("    title: warning EQUALS_SOURCE, LENGTH_RATIO_OUTLIER");
  });

  it("names each wrong ICU arm of an error finding", async () => {
    const summary = qaSummary({
      checked: 1,
      errors: 1,
      warnings: 0,
      findings: [
        {
          key: "files",
          severity: "error",
          reason: "icu",
          details: ['{n} plural: missing arm "few" required by the target language'],
        },
      ],
    });
    const { deps } = recordingDeps({ check: async () => summary });
    const cap = captureStreams();

    await run(["check", "--qa"], deps, cap.streams);

    expect(cap.out()).toContain(
      '    files: error icu ({n} plural: missing arm "few" required by the target language)',
    );
  });

  it("names each dropped other-syntax placeholder of a warning finding", async () => {
    const summary = qaSummary({
      checked: 1,
      errors: 0,
      warnings: 1,
      findings: [
        {
          key: "greeting",
          severity: "warning",
          reason: "FOREIGN_PLACEHOLDER_CHANGED",
          details: ["-{name}"],
        },
      ],
    });
    const { deps } = recordingDeps({ check: async () => summary });
    const cap = captureStreams();

    await run(["check", "--qa"], deps, cap.streams);

    expect(cap.out()).toContain("    greeting: warning FOREIGN_PLACEHOLDER_CHANGED (-{name})");
  });

  it("reports a clean locale and the skipped invalid source keys", async () => {
    const summary = qaSummary(
      { checked: 1, errors: 0, warnings: 0, findings: [] },
      { invalidSourceKeys: ["broken"] },
    );
    const { deps } = recordingDeps({ check: async () => summary });
    const cap = captureStreams();

    await run(["check", "--qa"], deps, cap.streams);

    expect(cap.out()).toContain("qa: 0 errors, 0 warnings");
    expect(cap.out()).toContain("  de: clean, 1 value checked");
    expect(cap.out()).toContain("  skipped, source is not valid ICU: broken");
  });

  it("neutralizes control characters in keys and details", async () => {
    const summary = qaSummary({
      checked: 1,
      errors: 1,
      warnings: 0,
      findings: [
        { key: "a\u001b[31m", severity: "error", reason: "markup", details: ["-<b\u0007>"] },
      ],
    });
    const { deps } = recordingDeps({ check: async () => summary });
    const cap = captureStreams();

    await run(["check", "--qa"], deps, cap.streams);

    expect(cap.out()).not.toContain("\u001b");
    expect(cap.out()).not.toContain("\u0007");
  });

  it("carries the qa report through the JSON envelope unchanged", async () => {
    const summary = qaSummary(BROKEN);
    const { deps } = recordingDeps({ check: async () => summary });
    const cap = captureStreams();

    await run(["check", "--qa", "--json"], deps, cap.streams);

    expect(parseEnvelope(cap.out())).toMatchObject({ ok: true, command: "check", result: summary });
  });
});
