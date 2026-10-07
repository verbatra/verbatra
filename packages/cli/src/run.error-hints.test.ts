import {
  type DoctorResult,
  declareProviderKeyEnvVar,
  errorHint,
  ProviderError,
  SdkError,
} from "@verbatra/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CLI_ERROR_CODES } from "./cli-error-codes.js";
import { CLI_ERROR_HINTS, usageErrorHint } from "./cli-error-hints.js";
import { renderDoctorHuman } from "./render.js";
import { run } from "./run.js";
import { captureStreams, makeDoctorResult, parseEnvelope, recordingDeps } from "./test-support.js";

const KEY_SENTINEL = "sk-cli-hint-sentinel-3f9a1c7e5b2d";
const CUSTOM_ENV_VAR = "ACME_TRANSLATE_TOKEN";

afterEach(() => {
  vi.unstubAllEnvs();
});

interface HintedEnvelope {
  readonly ok: boolean;
  readonly code?: string;
  readonly hint?: string;
}

function hintedEnvelope(out: string): HintedEnvelope {
  return parseEnvelope(out) as HintedEnvelope;
}

function missingKeyFailure(envVar: string): SdkError {
  return new SdkError("PROVIDER_CONSTRUCTION_FAILED", `Failed to construct provider: ${envVar}`, {
    cause: new ProviderError("MISSING_API_KEY", `The ${envVar} environment variable is not set.`, {
      envVar,
    }),
  });
}

describe("CLI_ERROR_HINTS", () => {
  it("gives every code the CLI raises itself a hint, except the codeless fallback", () => {
    const withoutHint = CLI_ERROR_CODES.filter((code) => CLI_ERROR_HINTS[code] === undefined);

    expect(withoutHint).toEqual(["CLI_ERROR"]);
  });

  it("names the command's own help when the command is known", () => {
    expect(usageErrorHint("check")).toBe(
      "Run `verbatra check --help` to see the options and arguments it accepts.",
    );
    expect(usageErrorHint(null)).toContain("`verbatra --help`");
  });
});

describe("run: the hint on a whole-run error", () => {
  it("carries the SDK's hint in the --json envelope", async () => {
    const { deps } = recordingDeps({
      loadConfig: () => Promise.reject(new SdkError("CONFIG_NOT_FOUND", "none")),
    });
    const cap = captureStreams();

    expect(await run(["check", "--json"], deps, cap.streams)).toBe(2);

    expect(hintedEnvelope(cap.out())).toMatchObject({
      ok: false,
      code: "CONFIG_NOT_FOUND",
      hint: errorHint({ code: "CONFIG_NOT_FOUND" }),
    });
    expect(cap.err()).not.toContain("next:");
  });

  it("prints the hint as a next line after the human error line", async () => {
    const { deps } = recordingDeps({
      loadConfig: () => Promise.reject(new SdkError("CONFIG_NOT_FOUND", "none")),
    });
    const cap = captureStreams();

    await run(["check"], deps, cap.streams);

    expect(cap.err()).toBe(
      `verbatra: error [CONFIG_NOT_FOUND] none\nnext: ${errorHint({ code: "CONFIG_NOT_FOUND" })}\n`,
    );
  });

  it("carries the CLI's own hint for a usage error the CLI raises itself", async () => {
    const { deps } = recordingDeps();
    const cap = captureStreams();

    await run(["check", "--json", "--locales", ""], deps, cap.streams);

    expect(hintedEnvelope(cap.out())).toMatchObject({
      code: "INVALID_LOCALES",
      hint: CLI_ERROR_HINTS.INVALID_LOCALES,
    });
  });

  it("names the key variable to set, never a key value", async () => {
    vi.stubEnv("OPENAI_API_KEY", KEY_SENTINEL);
    vi.stubEnv(CUSTOM_ENV_VAR, KEY_SENTINEL);
    declareProviderKeyEnvVar({
      id: "openai-compatible",
      options: {
        baseUrl: "http://localhost:11434/v1",
        model: "local-model",
        maxOutputTokens: 256,
        apiKeyEnvVar: CUSTOM_ENV_VAR,
      },
    });
    const { deps } = recordingDeps({
      translate: () => Promise.reject(missingKeyFailure("GEMINI_API_KEY")),
    });
    const json = captureStreams();
    const human = captureStreams();

    expect(await run(["translate", "--json"], deps, json.streams)).toBe(2);
    await run(["translate"], deps, human.streams);

    expect(hintedEnvelope(json.out()).hint).toBe(
      "Set GEMINI_API_KEY in the environment, or, with the CLI, in a .env file in the project directory.",
    );
    expect(human.err()).toContain("next: Set GEMINI_API_KEY");
    expect(`${json.out()}${json.err()}${human.err()}`).not.toContain(KEY_SENTINEL);
  });
});

describe("run: the hint on a commander usage error", () => {
  it.each([
    [["check", "--json", "--nope"], "check"],
    [["import", "--json"], "import"],
    [["check", "--json", "--severity"], "check"],
    [["frobnicate", "--json"], null],
  ] as const)("%j carries USAGE_ERROR and the help hint", async (argv, command) => {
    const { deps } = recordingDeps();
    const cap = captureStreams();

    expect(await run([...argv], deps, cap.streams)).toBe(2);

    expect(hintedEnvelope(cap.out())).toMatchObject({
      ok: false,
      code: "USAGE_ERROR",
      hint: usageErrorHint(command),
    });
    expect(cap.err()).not.toContain("next:");
  });

  it.each([
    [["translate", "--nope"], "unknown option '--nope'", "translate"],
    [["bogus"], "unknown command 'bogus'", null],
    [["import"], "missing required argument 'workbook'", "import"],
    [
      ["report", "nope"],
      "command-argument value 'nope' is invalid for argument 'report'.",
      "report",
    ],
    [["check", "extra"], "too many arguments for 'check'.", "check"],
  ] as const)(
    "%j prints one USAGE_ERROR line and the help hint on stderr only",
    async (argv, message, command) => {
      const { deps } = recordingDeps();
      const cap = captureStreams();

      expect(await run([...argv], deps, cap.streams)).toBe(2);

      const lines = cap
        .err()
        .split("\n")
        .filter((line) => line !== "");
      expect(lines).toHaveLength(2);
      expect(lines[0]).toMatch(/^verbatra: error \[USAGE_ERROR\] /);
      expect(lines[0]).toContain(message);
      expect(lines[1]).toBe(`next: ${usageErrorHint(command)}`);
      expect(cap.out()).toBe("");
    },
  );

  it("writes the USAGE_ERROR line to stderr next to the --json envelope", async () => {
    const { deps } = recordingDeps();
    const cap = captureStreams();

    expect(await run(["check", "--json", "--nope"], deps, cap.streams)).toBe(2);

    expect(cap.err()).toBe("verbatra: error [USAGE_ERROR] unknown option '--nope'\n");
    expect(parseEnvelope(cap.out()).message).toBe("error: unknown option '--nope'");
  });

  it("prints the help hint after the USAGE_ERROR line without --json", async () => {
    const { deps } = recordingDeps();
    const cap = captureStreams();

    expect(await run(["check", "--nope"], deps, cap.streams)).toBe(2);

    expect(cap.err()).toContain("verbatra: error [USAGE_ERROR] unknown option '--nope'");
    expect(cap.err()).not.toMatch(/^error: /m);
    expect(
      cap
        .err()
        .trimEnd()
        .endsWith(`next: ${usageErrorHint("check")}`),
    ).toBe(true);
    expect(cap.out()).toBe("");
  });

  it("keeps the hint off stderr under --quiet", async () => {
    const { deps } = recordingDeps();
    const cap = captureStreams();

    expect(await run(["--quiet", "check", "--nope"], deps, cap.streams)).toBe(2);

    expect(cap.err()).toContain("--nope");
    expect(cap.err()).not.toContain("next:");
  });
});

describe("render: doctor fixes", () => {
  it("prints the fix under the failed check it belongs to", () => {
    const result: DoctorResult = makeDoctorResult({
      ok: false,
      checks: [
        { id: "config", title: "Configuration", status: "pass", detail: "Loaded x." },
        {
          id: "api-key",
          title: "API key environment variable",
          status: "fail",
          detail: "The GEMINI_API_KEY environment variable is not set.",
          fix: "Set GEMINI_API_KEY in the environment.",
        },
      ],
    });

    expect(renderDoctorHuman(result).split("\n").slice(1, 4)).toEqual([
      "  [ok  ] Configuration: Loaded x.",
      "  [fail] API key environment variable: The GEMINI_API_KEY environment variable is not set.",
      "         fix: Set GEMINI_API_KEY in the environment.",
    ]);
  });

  it("carries fix in the doctor --json envelope", async () => {
    const report = makeDoctorResult({
      ok: false,
      checks: [
        {
          id: "api-key",
          title: "API key environment variable",
          status: "fail",
          detail: "unset",
          fix: "Set GEMINI_API_KEY in the environment.",
        },
      ],
    });
    const { deps } = recordingDeps({ doctor: async () => report });
    const cap = captureStreams();

    expect(await run(["doctor", "--json"], deps, cap.streams)).toBe(1);

    expect(parseEnvelope(cap.out()).result).toEqual(report);
  });
});
