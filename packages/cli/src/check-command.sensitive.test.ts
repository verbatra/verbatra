import type { CheckSensitiveSummary, CheckSummary } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import { run } from "./run.js";
import { captureStreams, makeCheckSummary, parseEnvelope, recordingDeps } from "./test-support.js";

function sensitiveSummary(sensitive: CheckSensitiveSummary): CheckSummary {
  return makeCheckSummary({
    inSync: true,
    locales: [{ locale: "de", missing: 0, stale: 0, upToDate: 3, inSync: true }],
    sensitive,
  });
}

const CLEAN = sensitiveSummary({ findings: [], glossaryTerms: 0 });
const FOUND = sensitiveSummary({
  findings: [
    { key: "contact", fields: ["value"], detectors: ["email"] },
    { key: "billing", fields: ["value", "description"], detectors: ["iban", "pattern"] },
  ],
  glossaryTerms: 1,
});
const TERMS_ONLY = sensitiveSummary({ findings: [], glossaryTerms: 2 });

describe("run check --sensitive", () => {
  it("passes sensitive to the SDK, and leaves it out without the flag", async () => {
    const { deps, calls } = recordingDeps({ check: async () => CLEAN });

    await run(["check", "--sensitive"], deps, captureStreams().streams);
    await run(["check"], deps, captureStreams().streams);

    expect(calls.check[0]).toMatchObject({ sensitive: true });
    expect(calls.check[1]).not.toHaveProperty("sensitive");
  });

  it("exits 0 and says so when nothing was found", async () => {
    const { deps } = recordingDeps({ check: async () => CLEAN });
    const cap = captureStreams();

    expect(await run(["check", "--sensitive"], deps, cap.streams)).toBe(0);
    expect(cap.out()).toContain("sensitive: nothing found");
  });

  it("exits 1 and names each key with its detectors and fields, never the text", async () => {
    const { deps } = recordingDeps({ check: async () => FOUND });
    const cap = captureStreams();

    expect(await run(["check", "--sensitive"], deps, cap.streams)).toBe(1);
    expect(cap.out()).toContain(
      "sensitive: 2 keys and 1 glossary term hold content that looks sensitive",
    );
    expect(cap.out()).toContain("  contact: email in value");
    expect(cap.out()).toContain("  billing: iban, pattern in value, description");
    expect(cap.out()).toContain("sensitiveData.allow");
  });

  it("exits 1 on glossary terms alone", async () => {
    const { deps } = recordingDeps({ check: async () => TERMS_ONLY });

    expect(await run(["check", "--sensitive"], deps, captureStreams().streams)).toBe(1);
  });

  it("carries the findings in the JSON envelope", async () => {
    const { deps } = recordingDeps({ check: async () => FOUND });
    const cap = captureStreams();

    await run(["check", "--sensitive", "--json"], deps, cap.streams);

    expect(parseEnvelope(cap.out())).toMatchObject({
      ok: true,
      command: "check",
      result: { sensitive: { glossaryTerms: 1 } },
    });
  });

  it("refuses --file, which checks a target file the scan never reads", async () => {
    const { deps, calls } = recordingDeps({ check: async () => CLEAN });
    const cap = captureStreams();

    expect(
      await run(["check", "--sensitive", "--file", "locales/de.json"], deps, cap.streams),
    ).toBe(2);
    expect(cap.err()).toContain("--sensitive cannot be combined with --file");
    expect(calls.check).toHaveLength(0);
  });
});
