import { type CheckFileSummary, type FileQaReport, SdkError } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import { run } from "./run.js";
import {
  captureStreams,
  makeCheckFileSummary,
  parseEnvelope,
  recordingDeps,
} from "./test-support.js";

function fileSummary(
  qa: FileQaReport,
  overrides: Partial<CheckFileSummary> = {},
): CheckFileSummary {
  return makeCheckFileSummary({
    locales: [{ locale: "de", incompletePlurals: [], qa }],
    qa: { errors: qa.errors, warnings: qa.warnings, invalidSourceKeys: [] },
    ...overrides,
  });
}

const BROKEN: FileQaReport = {
  checked: 2,
  errors: 1,
  warnings: 0,
  findings: [
    { key: "greeting", severity: "error", reason: "placeholder", details: ["-{name}", "+{nom}"] },
  ],
};

const SYNTAX: FileQaReport = {
  checked: 0,
  errors: 1,
  warnings: 0,
  findings: [
    {
      severity: "error",
      reason: "syntax",
      code: "INVALID_JSON",
      message: "The file is not valid JSON (line 3, column 3).",
      line: 3,
      column: 3,
    },
  ],
};

const WARNED: FileQaReport = {
  checked: 1,
  errors: 0,
  warnings: 1,
  findings: [{ key: "title", severity: "warning", reason: "EQUALS_SOURCE" }],
};

describe("run check --file: SDK delegation", () => {
  it("checks the one file through checkFile and never runs the project-wide check", async () => {
    const { deps, calls } = recordingDeps();
    const cap = captureStreams();

    const code = await run(
      ["check", "--file", "locales/de.json", "--severity", "error", "--cwd", "/proj"],
      deps,
      cap.streams,
    );

    expect(code).toBe(0);
    expect(calls.check).toHaveLength(0);
    expect(calls.checkFile).toEqual([
      expect.objectContaining({ cwd: "/proj", file: "locales/de.json", qaSeverity: "error" }),
    ]);
  });

  it("leaves the severity to the SDK default when none is given, and accepts a redundant --qa", async () => {
    const { deps, calls } = recordingDeps();
    const cap = captureStreams();

    await run(["check", "--file", "locales/de.json", "--qa"], deps, cap.streams);

    expect(calls.checkFile[0]).not.toHaveProperty("qaSeverity");
  });
});

describe("run check --file: usage errors", () => {
  it.each([
    [["--locales", "de"], "--locales"],
    [["--consistency"], "--consistency"],
    [["--require-reviewed"], "--require-reviewed"],
    [["--locales", "de", "--consistency"], "--locales, --consistency"],
  ])("rejects %j next to --file", async (flags, named) => {
    const { deps, calls } = recordingDeps();
    const cap = captureStreams();

    const code = await run(["check", "--file", "locales/de.json", ...flags], deps, cap.streams);

    expect(code).toBe(2);
    expect(cap.err()).toContain("[INVALID_OPTION]");
    expect(cap.err()).toContain(named);
    expect(calls.checkFile).toHaveLength(0);
  });

  it("rejects an empty --file in the JSON envelope", async () => {
    const { deps, calls } = recordingDeps();
    const cap = captureStreams();

    const code = await run(["check", "--file", " ", "--json"], deps, cap.streams);

    expect(code).toBe(2);
    expect(parseEnvelope(cap.out())).toMatchObject({ ok: false, code: "INVALID_OPTION" });
    expect(calls.checkFile).toHaveLength(0);
  });

  it("lets --strict and --severity through with --file alone", async () => {
    const { deps } = recordingDeps();
    const cap = captureStreams();

    expect(await run(["check", "--file", "locales/de.json", "--strict"], deps, cap.streams)).toBe(
      0,
    );
  });

  it("passes a path that is not a locale file through as a structured exit-2 failure", async () => {
    const { deps } = recordingDeps({
      checkFile: async () => {
        throw new SdkError(
          "NOT_A_LOCALE_FILE",
          "src/app.json is not a locale file of this project.",
        );
      },
    });
    const cap = captureStreams();

    const code = await run(["check", "--file", "src/app.json", "--json"], deps, cap.streams);

    expect(code).toBe(2);
    const envelope = parseEnvelope(cap.out());
    expect(envelope).toMatchObject({ ok: false, command: "check", code: "NOT_A_LOCALE_FILE" });
    expect(envelope).toHaveProperty("hint");
  });
});

describe("run check --file: exit code", () => {
  it.each([
    ["an integrity error", fileSummary(BROKEN), [], 1],
    ["a syntax error", fileSummary(SYNTAX), [], 1],
    ["a warning", fileSummary(WARNED), [], 0],
    ["a warning under --strict", fileSummary(WARNED), ["--strict"], 1],
  ] as const)("exits as check --qa does for %s", async (_label, summary, flags, expected) => {
    const { deps } = recordingDeps({ checkFile: async () => summary });
    const cap = captureStreams();

    expect(await run(["check", "--file", "locales/de.json", ...flags], deps, cap.streams)).toBe(
      expected,
    );
  });

  it("fails an incomplete plural only under --strict", async () => {
    const summary = makeCheckFileSummary({
      locales: [
        {
          locale: "pl",
          incompletePlurals: [
            {
              code: "PLURAL_CATEGORIES_INCOMPLETE",
              key: "items",
              ruleType: "cardinal",
              missing: ["few", "many"],
            },
          ],
          qa: { checked: 2, errors: 0, warnings: 0, findings: [] },
        },
      ],
    });
    const { deps } = recordingDeps({ checkFile: async () => summary });
    const cap = captureStreams();

    expect(await run(["check", "--file", "locales/pl.json"], deps, cap.streams)).toBe(0);
    expect(await run(["check", "--file", "locales/pl.json", "--strict"], deps, cap.streams)).toBe(
      1,
    );
    expect(cap.out()).toContain("items: missing few, many");
    expect(cap.out()).toContain("exit 1 only under --strict");
  });
});

describe("run check --file: output", () => {
  it("prints the summary as the check envelope under --json", async () => {
    const summary = fileSummary(SYNTAX);
    const { deps } = recordingDeps({ checkFile: async () => summary });
    const cap = captureStreams();

    await run(["check", "--file", "locales/de.json", "--json"], deps, cap.streams);

    expect(parseEnvelope(cap.out())).toEqual({
      ok: true,
      version: 1,
      command: "check",
      result: summary,
    });
  });

  it("names the file, the totals and each finding for a person", async () => {
    const { deps } = recordingDeps({ checkFile: async () => fileSummary(BROKEN) });
    const cap = captureStreams();

    await run(["check", "--file", "locales/de.json"], deps, cap.streams);

    expect(cap.out()).toContain("verbatra check --file locales/de.json (target)");
    expect(cap.out()).toContain("qa: 1 error, 0 warnings");
    expect(cap.out()).toContain("greeting: error placeholder (-{name}, +{nom})");
    expect(cap.err()).toContain("checking locales/de.json");
  });

  it("prints a syntax error with its adapter code and position", async () => {
    const { deps } = recordingDeps({ checkFile: async () => fileSummary(SYNTAX) });
    const cap = captureStreams();

    await run(["check", "--file", "locales/de.json"], deps, cap.streams);

    expect(cap.out()).toContain(
      "de: syntax error [INVALID_JSON] The file is not valid JSON (line 3, column 3).",
    );
  });

  it("reports a clean source file and the source keys that are not valid ICU", async () => {
    const summary = makeCheckFileSummary({
      file: "messages/en.json",
      role: "source",
      locales: [
        {
          locale: "en",
          incompletePlurals: [],
          qa: { checked: 0, errors: 0, warnings: 0, findings: [] },
        },
      ],
      qa: { errors: 0, warnings: 0, invalidSourceKeys: ["broken"] },
    });
    const { deps } = recordingDeps({ checkFile: async () => summary });
    const cap = captureStreams();

    await run(["check", "--file", "messages/en.json"], deps, cap.streams);

    expect(cap.out()).toContain("(source)");
    expect(cap.out()).toContain("en: clean, 0 values checked");
    expect(cap.out()).toContain("skipped, source is not valid ICU: broken");
  });
});
