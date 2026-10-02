import { describe, expect, it } from "vitest";
import {
  ALLOW_SPEND_ENV_VAR,
  BinUsageError,
  HELP_TEXT,
  parseArgs,
  REDACT_VALUES_ENV_VAR,
} from "./bin-args.js";

function usageError(argv: readonly string[]): BinUsageError {
  try {
    parseArgs(argv, {});
  } catch (error) {
    if (error instanceof BinUsageError) {
      return error;
    }
    throw error;
  }
  throw new Error("expected a usage error");
}

describe("parseArgs: serving", () => {
  it("reads --cwd and --config values", () => {
    expect(parseArgs(["--cwd", "/tmp/project", "--config", "verbatra.config.ts"], {})).toEqual({
      kind: "serve",
      options: {
        cwd: "/tmp/project",
        configPath: "verbatra.config.ts",
        allowSpend: false,
        redactValues: false,
      },
    });
  });

  it("reads --cwd=<path> and --config=<path> inline values", () => {
    expect(parseArgs(["--cwd=/tmp/project", "--config=a.ts"], {})).toEqual({
      kind: "serve",
      options: { cwd: "/tmp/project", configPath: "a.ts", allowSpend: false, redactValues: false },
    });
  });

  it("sets allowSpend when --allow-spend is present", () => {
    expect(parseArgs(["--allow-spend"], {})).toEqual({
      kind: "serve",
      options: { allowSpend: true, redactValues: false },
    });
  });

  it.each(["1", "true", " YES ", "on"])("sets allowSpend from %j in the environment", (value) => {
    expect(parseArgs([], { [ALLOW_SPEND_ENV_VAR]: value })).toEqual({
      kind: "serve",
      options: { allowSpend: true, redactValues: false },
    });
  });

  it.each([undefined, "0", "false", ""])("leaves allowSpend off for %j", (value) => {
    const env = value === undefined ? {} : { [ALLOW_SPEND_ENV_VAR]: value };
    expect(parseArgs([], env)).toEqual({
      kind: "serve",
      options: { allowSpend: false, redactValues: false },
    });
  });
});

describe("parseArgs: --redact-values", () => {
  it("sets redactValues when --redact-values is present", () => {
    expect(parseArgs(["--redact-values"], {})).toEqual({
      kind: "serve",
      options: { allowSpend: false, redactValues: true },
    });
  });

  it.each(["1", "true", " YES ", "on"])("sets redactValues from %j in the environment", (value) => {
    expect(parseArgs([], { [REDACT_VALUES_ENV_VAR]: value })).toEqual({
      kind: "serve",
      options: { allowSpend: false, redactValues: true },
    });
  });

  it.each(["0", "false", ""])("leaves redactValues off for %j", (value) => {
    expect(parseArgs([], { [REDACT_VALUES_ENV_VAR]: value })).toEqual({
      kind: "serve",
      options: { allowSpend: false, redactValues: false },
    });
  });
});

describe("parseArgs: help and version", () => {
  it.each([["--help"], ["-h"], ["--cwd", "/p", "--help"], ["--help", "--bogus"]])(
    "asks for help for %j",
    (...argv) => {
      expect(parseArgs(argv, {})).toEqual({ kind: "help" });
    },
  );

  it.each([["--version"], ["-V"], ["--allow-spend", "--version"]])(
    "asks for the version for %j",
    (...argv) => {
      expect(parseArgs(argv, {})).toEqual({ kind: "version" });
    },
  );

  it("lists every option the parser accepts in the help text", () => {
    for (const flag of [
      "--cwd <path>",
      "--config <path>",
      "--allow-spend",
      "--redact-values",
      "--version",
      "--help",
    ]) {
      expect(HELP_TEXT).toContain(flag);
    }
    expect(HELP_TEXT).toContain(ALLOW_SPEND_ENV_VAR);
    expect(HELP_TEXT).toContain(REDACT_VALUES_ENV_VAR);
  });
});

describe("parseArgs: usage errors", () => {
  it.each([
    [["--allowspend"], "unknown option '--allowspend' (did you mean --allow-spend?)"],
    [["--Allow_Spend"], "unknown option '--Allow_Spend' (did you mean --allow-spend?)"],
    [["--bogus"], "unknown option '--bogus'. Run verbatra-mcp --help for the options."],
    [["-x"], "unknown option '-x'."],
    [["--allow-spend=yes"], "unknown option '--allow-spend=yes'"],
    [["serve"], "unexpected argument 'serve': verbatra-mcp takes no positional arguments"],
    [
      ["--json"],
      "verbatra-mcp does not take --json: its stdout carries only MCP protocol messages",
    ],
  ])("refuses %j with a usage error", (argv, message) => {
    const error = usageError(argv);

    expect(error.code).toBe("USAGE_ERROR");
    expect(error.message).toContain(message);
  });

  it.each([
    [["--cwd", "--allow-spend"], "--cwd"],
    [["--config"], "--config"],
    [["--cwd="], "--cwd"],
    [["--config", "-h"], "--config"],
  ])("refuses %j for a missing value", (argv, flag) => {
    expect(usageError(argv).message).toMatch(new RegExp(`^Missing value for ${flag}\\.`));
  });

  it("does not suggest a short flag for an unknown one", () => {
    expect(usageError(["--h"]).message).toBe(
      "unknown option '--h'. Run verbatra-mcp --help for the options.",
    );
  });
});
