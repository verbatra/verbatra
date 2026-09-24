import { describe, expect, it } from "vitest";
import {
  DEFAULT_TERMINAL_SETTINGS,
  NON_INTERACTIVE_FACTS,
  resolveTerminalMode,
  type TerminalEnv,
  type TerminalFacts,
  type TerminalPreferences,
} from "./terminal-mode.js";

const HUMAN: TerminalPreferences = { json: false, quiet: false, color: true };

function tty(env: TerminalEnv = {}): TerminalFacts {
  return { env, stdinIsTty: true, stderrIsTty: true };
}

function piped(env: TerminalEnv = {}): TerminalFacts {
  return { env, stdinIsTty: false, stderrIsTty: false };
}

describe("resolveTerminalMode: output mode", () => {
  it.each([
    ["an interactive stderr", tty(), HUMAN, "tty"],
    ["a piped stderr", piped(), HUMAN, "plain"],
    ["CI=true on a terminal", tty({ CI: "true" }), HUMAN, "plain"],
    ["CI=1 on a terminal", tty({ CI: "1" }), HUMAN, "plain"],
    ["CI=false on a terminal", tty({ CI: "false" }), HUMAN, "tty"],
    ["CI=0 on a terminal", tty({ CI: "0" }), HUMAN, "tty"],
    ["an empty CI on a terminal", tty({ CI: "" }), HUMAN, "tty"],
    ["TERM=dumb on a terminal", tty({ TERM: "dumb" }), HUMAN, "plain"],
    ["--json on a terminal", tty(), { ...HUMAN, json: true }, "json"],
    ["--quiet on a terminal", tty(), { ...HUMAN, quiet: true }, "quiet"],
    ["--json and --quiet together", tty(), { ...HUMAN, json: true, quiet: true }, "json"],
  ] as const)("picks the mode for %s", (_label, facts, preferences, mode) => {
    expect(resolveTerminalMode(facts, preferences).mode).toBe(mode);
  });
});

describe("resolveTerminalMode: color", () => {
  it.each([
    ["an interactive stderr", tty(), HUMAN, true],
    ["a piped stderr", piped(), HUMAN, false],
    ["NO_COLOR on a terminal", tty({ NO_COLOR: "1" }), HUMAN, false],
    ["an empty NO_COLOR on a terminal", tty({ NO_COLOR: "" }), HUMAN, true],
    ["NODE_DISABLE_COLORS on a terminal", tty({ NODE_DISABLE_COLORS: "1" }), HUMAN, false],
    ["VERBATRA_NO_COLOR on a terminal", tty({ VERBATRA_NO_COLOR: "1" }), HUMAN, false],
    ["TERM=dumb on a terminal", tty({ TERM: "dumb" }), HUMAN, false],
    ["FORCE_COLOR=1 on a pipe", piped({ FORCE_COLOR: "1" }), HUMAN, true],
    ["an empty FORCE_COLOR on a pipe", piped({ FORCE_COLOR: "" }), HUMAN, true],
    ["FORCE_COLOR=3 over NO_COLOR", piped({ FORCE_COLOR: "3", NO_COLOR: "1" }), HUMAN, true],
    ["FORCE_COLOR=0 on a terminal", tty({ FORCE_COLOR: "0" }), HUMAN, false],
    ["--no-color over FORCE_COLOR", tty({ FORCE_COLOR: "1" }), { ...HUMAN, color: false }, false],
    [
      "VERBATRA_NO_COLOR over FORCE_COLOR",
      tty({ FORCE_COLOR: "1", VERBATRA_NO_COLOR: "1" }),
      HUMAN,
      false,
    ],
    ["--json even with FORCE_COLOR", tty({ FORCE_COLOR: "1" }), { ...HUMAN, json: true }, false],
    ["CI on a terminal", tty({ CI: "true" }), HUMAN, false],
    ["CI=false on a terminal", tty({ CI: "false" }), HUMAN, true],
    ["FORCE_COLOR=1 in CI", tty({ CI: "true", FORCE_COLOR: "1" }), HUMAN, true],
  ] as const)("decides color for %s", (_label, facts, preferences, color) => {
    expect(resolveTerminalMode(facts, preferences).color).toBe(color);
  });
});

describe("resolveTerminalMode: animation", () => {
  it.each([
    ["an interactive stderr", tty(), HUMAN, true],
    ["VERBATRA_NO_SPINNER on a terminal", tty({ VERBATRA_NO_SPINNER: "1" }), HUMAN, false],
    ["a piped stderr", piped(), HUMAN, false],
    ["CI on a terminal", tty({ CI: "true" }), HUMAN, false],
    ["--quiet on a terminal", tty(), { ...HUMAN, quiet: true }, false],
    ["--json on a terminal", tty(), { ...HUMAN, json: true }, false],
  ] as const)("decides animation for %s", (_label, facts, preferences, animate) => {
    expect(resolveTerminalMode(facts, preferences).animate).toBe(animate);
  });

  it("carries the stdin terminal fact through unchanged", () => {
    expect(resolveTerminalMode(tty(), HUMAN).stdinIsTty).toBe(true);
    expect(resolveTerminalMode(piped(), HUMAN).stdinIsTty).toBe(false);
  });
});

describe("DEFAULT_TERMINAL_SETTINGS", () => {
  it("is a plain, colorless, non-interactive terminal so programmatic callers get today's output", () => {
    expect(DEFAULT_TERMINAL_SETTINGS.facts).toBe(NON_INTERACTIVE_FACTS);
    expect(
      resolveTerminalMode(DEFAULT_TERMINAL_SETTINGS.facts, {
        json: false,
        quiet: DEFAULT_TERMINAL_SETTINGS.quiet,
        color: DEFAULT_TERMINAL_SETTINGS.color,
      }),
    ).toEqual({ mode: "plain", color: false, animate: false, stdinIsTty: false });
  });
});
