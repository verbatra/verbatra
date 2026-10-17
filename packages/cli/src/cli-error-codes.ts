/**
 * Every error code the `verbatra` CLI raises itself, as opposed to the codes it passes through
 * from the SDK, a provider, or a format adapter. Each one appears in the `verbatra: error [CODE]`
 * line on stderr and, under `--json`, as the `code` of the `ok: false` envelope. `CLI_ERROR` is
 * the fallback for a failure that carried no code of its own. `CONFIG_INVALID` is also an SDK
 * code; the CLI raises it itself only when `init` cannot scaffold a valid config. Sorted
 * alphabetically.
 */
export const CLI_ERROR_CODES = [
  "AGENT_FILE_INVALID",
  "CLI_ERROR",
  "CONFIG_EXISTS",
  "CONFIG_INVALID",
  "FORMAT_AMBIGUOUS",
  "INIT_UNWRITABLE",
  "INVALID_CONCURRENCY",
  "INVALID_DEBOUNCE",
  "INVALID_DIRECTION",
  "INVALID_FORMAT",
  "INVALID_LOCALE",
  "INVALID_LOCALES",
  "INVALID_LOCK_TIMEOUT",
  "INVALID_MAX_TOKENS",
  "INVALID_OPTION",
  "INVALID_OUT",
  "INVALID_PORT",
  "INVALID_PROVIDER",
  "INVALID_QA_OPTION",
  "INVALID_SEVERITY",
  "LAYOUT_AMBIGUOUS",
  "MISSING_OPTIONS",
  "REDACTION_UNSUPPORTED",
  "USAGE_ERROR",
] as const;

/** One of the {@link CLI_ERROR_CODES}: an error code the `verbatra` CLI raises itself. */
export type CliErrorCode = (typeof CLI_ERROR_CODES)[number];
