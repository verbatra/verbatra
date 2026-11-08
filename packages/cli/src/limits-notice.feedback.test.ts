import { describe, expect, it } from "vitest";
import { run } from "./run.js";
import {
  captureStreams,
  makeCheckFileSummary,
  makeCheckSummary,
  makeExportResult,
  recordingDeps,
} from "./test-support.js";

const NOTICE = {
  code: "LIMITS_FILE_IGNORED",
  message: "verbatra.limits.json is not valid JSON, so it was ignored.",
} as const;

describe("an unusable verbatra.limits.json reaches the user on stderr", () => {
  it("prints the notice for check --qa, leaves stdout alone, and keeps the exit code", async () => {
    const { deps } = recordingDeps({
      check: async () =>
        makeCheckSummary({
          qa: { errors: 0, warnings: 0, invalidSourceKeys: [], limitsNotice: NOTICE },
        }),
    });
    const cap = captureStreams();

    const code = await run(["check", "--qa"], deps, cap.streams);

    expect(code).toBe(0);
    expect(cap.err()).toContain(NOTICE.message);
    expect(cap.out()).not.toContain(NOTICE.message);
  });

  it("prints the notice for check --file", async () => {
    const { deps } = recordingDeps({
      checkFile: async () =>
        makeCheckFileSummary({
          qa: { errors: 0, warnings: 0, invalidSourceKeys: [], limitsNotice: NOTICE },
        }),
    });
    const cap = captureStreams();

    await run(["check", "--file", "locales/de.json"], deps, cap.streams);

    expect(cap.err()).toContain(NOTICE.message);
  });

  it("prints the notice for export, also with --json, whose stdout keeps the field", async () => {
    const { deps } = recordingDeps({
      exportWorkbook: async () => makeExportResult({ limitsNotice: NOTICE }),
    });
    const human = captureStreams();
    const json = captureStreams();

    await run(["export"], deps, human.streams);
    await run(["export", "--json"], deps, json.streams);

    expect(human.err()).toContain(NOTICE.message);
    expect(json.err()).toContain(NOTICE.message);
    expect(json.out()).toContain("LIMITS_FILE_IGNORED");
  });

  it("prints nothing extra when the file was usable", async () => {
    const { deps } = recordingDeps({
      check: async () =>
        makeCheckSummary({ qa: { errors: 0, warnings: 0, invalidSourceKeys: [] } }),
      exportWorkbook: async () => makeExportResult(),
    });
    const check = captureStreams();
    const exported = captureStreams();

    await run(["check", "--qa"], deps, check.streams);
    await run(["export"], deps, exported.streams);

    expect(check.err()).not.toContain("limits");
    expect(exported.err()).not.toContain("limits");
  });
});
