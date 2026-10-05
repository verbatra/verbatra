import type { CliErrorCode } from "./cli-error-codes.js";

export const CLI_ERROR_HINTS = {
  AGENT_FILE_INVALID:
    "Repair the .mcp.json or the verbatra markers in the file the message names, then run `verbatra init --agent` again.",
  CLI_ERROR: undefined,
  CONFIG_EXISTS:
    "Edit the existing config, or pass --force to replace verbatra.config.ts; remove any other config file the message names first.",
  CONFIG_INVALID: "Correct the init answers the message names, then run `verbatra init` again.",
  FORMAT_AMBIGUOUS: "Pass --format with one of the candidates.",
  INIT_UNWRITABLE: "Make the directory writable, then run `verbatra init` again.",
  INVALID_CONCURRENCY: "Pass --concurrency as a whole number from 1 to 100.",
  INVALID_DEBOUNCE: "Pass --debounce as a whole number of milliseconds from 1 to 60000.",
  INVALID_DIRECTION:
    "Run `verbatra tmx import` or `verbatra tmx export`, with only the flags that direction takes.",
  INVALID_FORMAT: "Pass a supported --format value; the command's --help lists them.",
  INVALID_LOCALE:
    "Give the locale as a language tag of letters, digits and hyphens, such as pt-BR or en-XA.",
  INVALID_LOCALES:
    "Pass --locales as a comma-separated list of configured target locales, or omit it.",
  INVALID_LOCK_TIMEOUT: "Pass --lock-timeout as a whole number of seconds from 1 to 3600.",
  INVALID_MAX_TOKENS: "Pass --max-tokens as a whole number of at least 1.",
  INVALID_OPTION: "Correct or remove the flag the message names.",
  INVALID_OUT: "Pass --out with a file path, or omit it.",
  INVALID_PORT: "Pass --port as a whole number from 1 to 65535.",
  INVALID_PROVIDER:
    "Pass --provider with a supported provider id; `verbatra init --help` lists them.",
  INVALID_QA_OPTION: "Add --qa or --file, and do not combine --strict with --severity error.",
  INVALID_SEVERITY: "Pass --severity error or --severity warning.",
  LAYOUT_AMBIGUOUS: "Pass --path with one of the candidates.",
  MISSING_OPTIONS: "Pass the flags the message names, or --yes where the message offers it.",
  REDACTION_UNSUPPORTED:
    "Upgrade @verbatra/mcp to the version that ships with this CLI, then start `verbatra mcp --redact-values` again.",
  USAGE_ERROR: "Run the command with --help to see the options and arguments it accepts.",
} as const satisfies Record<CliErrorCode, string | undefined>;

export function usageErrorHint(command: string | null): string {
  const help = command === null ? "verbatra --help" : `verbatra ${command} --help`;
  return `Run \`${help}\` to see the options and arguments it accepts.`;
}
