export type TerminalEnv = Readonly<Record<string, string | undefined>>;

export interface TerminalFacts {
  readonly env: TerminalEnv;
  readonly stdinIsTty: boolean;
  readonly stderrIsTty: boolean;
}

export interface TerminalPreferences {
  readonly json: boolean;
  readonly quiet: boolean;
  readonly color: boolean;
}

export type OutputMode = "tty" | "plain" | "json" | "quiet";

export interface TerminalMode {
  readonly mode: OutputMode;
  readonly color: boolean;
  readonly animate: boolean;
  readonly stdinIsTty: boolean;
}

export interface TerminalSettings {
  readonly facts: TerminalFacts;
  readonly quiet: boolean;
  readonly color: boolean;
}

export const NON_INTERACTIVE_FACTS: TerminalFacts = {
  env: {},
  stdinIsTty: false,
  stderrIsTty: false,
};

export const DEFAULT_TERMINAL_SETTINGS: TerminalSettings = {
  facts: NON_INTERACTIVE_FACTS,
  quiet: false,
  color: true,
};

const FORCE_COLOR_ON = new Set(["", "1", "2", "3", "true"]);

const CI_OFF = new Set(["", "0", "false"]);

function isSetNonEmpty(value: string | undefined): boolean {
  return value !== undefined && value !== "";
}

function isCi(env: TerminalEnv): boolean {
  const value = env.CI;
  return value !== undefined && !CI_OFF.has(value.trim().toLowerCase());
}

function isDumb(env: TerminalEnv): boolean {
  return env.TERM === "dumb";
}

function resolveOutputMode(facts: TerminalFacts, preferences: TerminalPreferences): OutputMode {
  if (preferences.json) {
    return "json";
  }
  if (preferences.quiet) {
    return "quiet";
  }
  return facts.stderrIsTty && !isCi(facts.env) && !isDumb(facts.env) ? "tty" : "plain";
}

function resolveColor(facts: TerminalFacts, preferences: TerminalPreferences): boolean {
  const env = facts.env;
  if (preferences.json || !preferences.color || isSetNonEmpty(env.VERBATRA_NO_COLOR)) {
    return false;
  }
  const force = env.FORCE_COLOR;
  if (force !== undefined) {
    return FORCE_COLOR_ON.has(force.trim().toLowerCase());
  }
  if (
    isSetNonEmpty(env.NO_COLOR) ||
    isSetNonEmpty(env.NODE_DISABLE_COLORS) ||
    isDumb(env) ||
    isCi(env)
  ) {
    return false;
  }
  return facts.stderrIsTty;
}

export function resolveTerminalMode(
  facts: TerminalFacts,
  preferences: TerminalPreferences,
): TerminalMode {
  const mode = resolveOutputMode(facts, preferences);
  return {
    mode,
    color: resolveColor(facts, preferences),
    animate: mode === "tty" && !isSetNonEmpty(facts.env.VERBATRA_NO_SPINNER),
    stdinIsTty: facts.stdinIsTty,
  };
}
