export const BIN_NAME = "verbatra-mcp";

export const ALLOW_SPEND_ENV_VAR = "VERBATRA_MCP_ALLOW_SPEND";

const TRUTHY_ENV_VALUES = new Set(["1", "true", "yes", "on"]);

export interface BinOptions {
  readonly cwd?: string;
  readonly configPath?: string;
  readonly allowSpend: boolean;
}

export type BinInvocation =
  | { readonly kind: "serve"; readonly options: BinOptions }
  | { readonly kind: "help" }
  | { readonly kind: "version" };

export class BinUsageError extends Error {
  readonly code = "USAGE_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "BinUsageError";
  }
}

const VALUE_FLAGS = ["--cwd", "--config"] as const;

type ValueFlag = (typeof VALUE_FLAGS)[number];

const KNOWN_FLAGS = [...VALUE_FLAGS, "--allow-spend", "--help", "--version"];

export const HELP_TEXT = [
  `Usage: ${BIN_NAME} [options]`,
  "",
  "Start a stdio MCP server exposing verbatra's tools to an MCP client",
  "",
  "Options:",
  "  --cwd <path>     resolve config and locale files from this directory",
  "  --config <path>  load this config file instead of searching for one",
  `  --allow-spend    advertise the tools that call a translation provider (also: ${ALLOW_SPEND_ENV_VAR})`,
  "  -V, --version    print the version and exit",
  "  -h, --help       print this help and exit",
  "",
  "Nothing but MCP protocol messages is ever written to stdout while the server runs; every log",
  "line goes to stderr.",
  "",
].join("\n");

function isEnvValueTruthy(value: string | undefined): boolean {
  return value !== undefined && TRUTHY_ENV_VALUES.has(value.trim().toLowerCase());
}

function isValueFlag(flag: string): flag is ValueFlag {
  return VALUE_FLAGS.some((known) => known === flag);
}

function lettersOf(flag: string): string {
  return flag.toLowerCase().replace(/[^a-z]/g, "");
}

function suggestionFor(flag: string): string {
  const letters = lettersOf(flag);
  const match = KNOWN_FLAGS.find((known) => lettersOf(known) === letters);
  return match === undefined ? "" : ` (did you mean ${match}?)`;
}

function unknownOption(flag: string): BinUsageError {
  if (flag === "--json") {
    return new BinUsageError(
      `${BIN_NAME} does not take --json: its stdout carries only MCP protocol messages, so it never prints a JSON envelope. Remove --json.`,
    );
  }
  return new BinUsageError(
    `unknown option '${flag}'${suggestionFor(flag)}. Run ${BIN_NAME} --help for the options.`,
  );
}

interface ParseState {
  cwd?: string;
  configPath?: string;
  allowSpend: boolean;
}

function assignValue(state: ParseState, flag: ValueFlag, value: string | undefined): void {
  if (value === undefined || value === "" || value.startsWith("-")) {
    throw new BinUsageError(`Missing value for ${flag}. Run ${BIN_NAME} --help for the options.`);
  }
  if (flag === "--cwd") {
    state.cwd = value;
  } else {
    state.configPath = value;
  }
}

function splitInlineValue(arg: string): readonly [string, string | undefined] {
  const equals = arg.indexOf("=");
  return arg.startsWith("--") && equals > 0
    ? [arg.slice(0, equals), arg.slice(equals + 1)]
    : [arg, undefined];
}

const SHORTCUTS: ReadonlyMap<string, "help" | "version"> = new Map([
  ["--help", "help"],
  ["-h", "help"],
  ["--version", "version"],
  ["-V", "version"],
]);

function unexpectedArgument(arg: string): BinUsageError {
  if (arg.startsWith("-")) {
    return unknownOption(arg);
  }
  return new BinUsageError(
    `unexpected argument '${arg}': ${BIN_NAME} takes no positional arguments. Run ${BIN_NAME} --help for the options.`,
  );
}

function consume(state: ParseState, argv: readonly string[], index: number): number {
  const arg = argv[index] ?? "";
  const [flag, inline] = splitInlineValue(arg);
  if (isValueFlag(flag)) {
    assignValue(state, flag, inline ?? argv[index + 1]);
    return inline === undefined ? 2 : 1;
  }
  if (arg === "--allow-spend") {
    state.allowSpend = true;
    return 1;
  }
  throw unexpectedArgument(arg);
}

function toOptions(state: ParseState): BinOptions {
  return {
    ...(state.cwd !== undefined ? { cwd: state.cwd } : {}),
    ...(state.configPath !== undefined ? { configPath: state.configPath } : {}),
    allowSpend: state.allowSpend,
  };
}

export function parseArgs(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): BinInvocation {
  const state: ParseState = { allowSpend: isEnvValueTruthy(env[ALLOW_SPEND_ENV_VAR]) };
  let index = 0;
  while (index < argv.length) {
    const shortcut = SHORTCUTS.get(argv[index] ?? "");
    if (shortcut !== undefined) {
      return { kind: shortcut };
    }
    index += consume(state, argv, index);
  }
  return { kind: "serve", options: toOptions(state) };
}
