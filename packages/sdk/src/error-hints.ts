import { ProviderError, type ProviderErrorCode } from "@verbatra/ai-providers";
import type { AdapterErrorCode } from "@verbatra/format-adapters";
import {
  GlossaryNotConfiguredError,
  type InputFileErrorCode,
  type InputFileKind,
  type SdkErrorCode,
} from "./errors.js";

const WRITABLE_OUTPUT_HINT = "Make the output file and its directory writable, then try again.";

const MANAGED_OUTPUT_HINT =
  "Choose an output path inside the project that names no locale file or other file verbatra manages.";

const SDK_ERROR_HINTS = {
  CONFIG_NOT_FOUND:
    "Run `verbatra init` to create a config, or pass the path of an existing config file.",
  CONFIG_INVALID:
    "Fix the config field the message names, then run `verbatra doctor` to confirm the setup.",
  UNKNOWN_FORMAT:
    "Set `format` in the config to a supported format, or register an adapter for this one.",
  UNKNOWN_LOCALE: "Use a locale from the config's `targetLocales`, or add it there first.",
  UNKNOWN_KEY: "Use a key that exists in the source locale file, or add it there first.",
  KEY_PROTECTED:
    'Keep the human-written value, or opt in to replacing it: include human edits for this call, or set `humanEdits: "overwrite"` in the config.',
  KEY_PINNED:
    "Edit the value by hand, or remove the key from `pinnedKeys` in the config to let verbatra write it.",
  PROVIDER_CONSTRUCTION_FAILED:
    "Check the config's `provider` block and its API key environment variable, then run `verbatra doctor`.",
  MACHINE_TRANSLATION_DISABLED:
    'Translate the key by hand, or configure a machine provider in place of `provider: { id: "none" }`.',
  NETWORK_POLICY_VIOLATION:
    "Point the provider at a host the network policy permits, or add its host to `network.allowedHosts` or VERBATRA_NETWORK_ALLOWED_HOSTS.",
  SOURCE_UNREADABLE:
    "Create the source locale file, or fix `files.pattern` and `sourceLocale` in the config so they point at it.",
  SOURCE_INVALID: "Fix the file the message names so it parses under the configured format.",
  LOCK_FILE_INVALID: "Restore verbatra.lock.json from version control, then try again.",
  PROVENANCE_FILE_INVALID: "Restore verbatra.provenance.json from version control, then try again.",
  PROVENANCE_FILE_UNWRITABLE:
    "Upgrade verbatra if a newer version wrote verbatra.provenance.json, then record the decision again.",
  REVIEW_VALUE_CHANGED: "Reload the current value, review it again, and resend the decision.",
  REVIEW_SOURCE_CHANGED: "Edit or retranslate the key first, then review its new value.",
  REVIEW_REJECT_UNSUPPORTED: "Edit the value instead of rejecting it.",
  REVIEW_RESTORE_FAILED: "Restore the files the message names from version control.",
  REVIEWER_INVALID: "Pass a reviewer name of 1 to 64 characters with no control characters.",
  LOCK_CONTENDED:
    "Wait for the other verbatra process to finish and try again, or remove the lock file the message names if no process holds it.",
  GLOSSARY_NOT_FILE_BACKED:
    "Move the glossary into its own file and set the config's `glossary` to that file's path.",
  GLOSSARY_UNWRITABLE: "Make the glossary file and its directory writable, then try again.",
  LOCALE_LAYOUT_INVALID:
    "Fix `files.pattern` and `files.localeStyle` in the config so every locale maps to a valid path.",
  LOCALE_PATH_COLLISION:
    "Change `files.pattern` or `files.localeStyle` in the config so each locale resolves to its own file.",
  CONCURRENCY_INVALID: "Pass a concurrency that is a whole number of at least 1.",
  CONCURRENCY_BUDGET_CONFLICT:
    "Run with a concurrency of 1 while a token budget applies, or remove the budget.",
  MAX_TOKENS_INVALID: "Pass a token budget that is a whole number of at least 1.",
  LOCK_TIMEOUT_INVALID: "Pass a lock timeout that is a whole number of at least 0.",
  PAGE_CURSOR_INVALID: "Call again without a cursor to start from the first page.",
  PAGE_LIMIT_INVALID: "Pass a page limit that is a whole number from 1 to 1000.",
  TARGET_UNWRITABLE: "Make the target locale file and its directory writable, then try again.",
  PSEUDO_OUTPUT_CONFLICT:
    "Choose a pseudolocale and an output path inside the project that name no configured locale.",
  SOURCE_UNWRITABLE:
    "Make the source locale file writable; for xliff and apple-xcstrings, create the catalog first.",
  EXTRACT_NOT_CONFIGURED:
    "Add an `extract` block to the config naming the framework and source roots.",
  EXTRACT_FS_UNSUPPORTED:
    "Pass a file system that implements `readDirectory`, or use the default one.",
  TYPES_OUTPUT_CONFLICT:
    "Choose a relative `.ts`, `.mts` or `.cts` output path inside the project that names no file verbatra manages.",
  TYPES_UNWRITABLE: WRITABLE_OUTPUT_HINT,
  TMX_OUTPUT_CONFLICT: MANAGED_OUTPUT_HINT,
  TMX_UNWRITABLE: WRITABLE_OUTPUT_HINT,
  EXPORT_OUTPUT_CONFLICT: MANAGED_OUTPUT_HINT,
  EXPORT_UNWRITABLE: WRITABLE_OUTPUT_HINT,
  LOCALE_STATE_NOT_CARRIED_OVER:
    "Wait for other verbatra processes to finish, make verbatra.lock.json and verbatra.provenance.json writable, then try again.",
  LOCALE_UNSUPPORTED_BY_PROVIDER:
    "Remove the unsupported locale from `targetLocales`, map it to a supported code in `provider.options.localeMap`, or choose a provider that supports it.",
  NOT_A_LOCALE_FILE:
    "Pass the path of an existing locale file that `files.pattern` maps to a configured locale.",
  SENSITIVE_CONTENT_WITHHELD:
    "Remove the content from the key, list it in `sensitiveData.allow`, or turn the detector off in `sensitiveData.detectors`.",
  LOCALE_FAILED: "Fix the cause the locale's message names, then try again.",
} as const satisfies Record<SdkErrorCode, string>;

const HANDOFF_FILE_HINTS = {
  SOURCE_UNREADABLE:
    "Pass the path of the filled handoff file, or of the directory it was exported into, relative to the working directory or `--cwd`.",
  SOURCE_INVALID:
    "Fix the handoff file the message names, or pass its format with `--format` when its extension names none.",
} as const satisfies Record<InputFileErrorCode, string>;

const TMX_FILE_HINTS = {
  SOURCE_UNREADABLE:
    "Pass the path of an existing TMX file, relative to the working directory or `--cwd`.",
  SOURCE_INVALID:
    "Fix the TMX file the message names, or export it again from the tool that wrote it.",
} as const satisfies Record<InputFileErrorCode, string>;

const INPUT_FILE_HINTS: Readonly<Record<InputFileKind, Record<InputFileErrorCode, string>>> = {
  handoff: HANDOFF_FILE_HINTS,
  tmx: TMX_FILE_HINTS,
};

const PROVIDER_ERROR_HINTS = {
  MISSING_API_KEY:
    "Set the API key environment variable your provider reads, then run `verbatra doctor`.",
  INVALID_REQUEST: "Check the provider options in the config, such as the model name.",
  INVALID_RESPONSE: "Try again; if it keeps failing, configure a different model.",
  OUTPUT_TRUNCATED:
    "Translate fewer keys at a time, or configure a model with a larger output limit.",
  PROVIDER_REFUSED: "Review the source text the provider refused, or translate it by hand.",
  PROVIDER_BLOCKED: "Review the source text the provider blocked, or translate it by hand.",
  RATE_LIMITED: "Wait a moment and try again, or lower the concurrency.",
  TIMEOUT: "Try again, or raise the provider's `requestTimeoutMs` in the config.",
  AUTH_FAILED:
    "Check that the provider's API key is valid and allowed to use the configured model.",
  PROVIDER_UNAVAILABLE: "Try again later, or check the configured endpoint.",
  NETWORK_POLICY_VIOLATION: SDK_ERROR_HINTS.NETWORK_POLICY_VIOLATION,
  PROVIDER_ERROR: "Try again; if it keeps failing, check the provider configuration.",
} as const satisfies Record<ProviderErrorCode, string>;

const MODULE_RESOLUTION_CODES: ReadonlySet<string> = new Set([
  "MODULE_NOT_FOUND",
  "ERR_MODULE_NOT_FOUND",
  "ERR_PACKAGE_PATH_NOT_EXPORTED",
  "ERR_UNSUPPORTED_DIR_IMPORT",
]);

const CONFIG_IMPORT_UNRESOLVED_HINT =
  "Install the package the config file imports, or fix the import so it resolves from the config file's directory.";

const NO_GLOSSARY_HINT =
  'Create a glossary file, such as glossary.json holding `{}`, and set the config\'s `glossary` to its path, such as `"glossary.json"`.';

const MALFORMED_FILE_HINT = "Fix the syntax error the message names in that file.";

const ADAPTER_ERROR_HINTS = {
  INVALID_JSON: MALFORMED_FILE_HINT,
  INVALID_YAML: MALFORMED_FILE_HINT,
  INVALID_XML: MALFORMED_FILE_HINT,
  INVALID_STRUCTURE: "Reshape the file the message names to match the configured format.",
  MAX_DEPTH_EXCEEDED: "Reduce the nesting depth of the file the message names.",
  INPUT_TOO_LARGE: "Split the file the message names into smaller files.",
  MIXED_STRUCTURE: "Use either flat or nested keys throughout the file the message names.",
  ADAPTER_FAILED: "Report the failure to the maintainer of the custom adapter the message names.",
  DUPLICATE_FORMAT: "Register only one adapter for each format identifier.",
  INVALID_FORMAT_ID: "Name the custom adapter `custom:` followed by a valid name.",
} as const satisfies Record<AdapterErrorCode, string>;

const HINTS_BY_CODE: Readonly<Record<string, string>> = {
  ...ADAPTER_ERROR_HINTS,
  ...PROVIDER_ERROR_HINTS,
  ...SDK_ERROR_HINTS,
};

export function sdkErrorHint(code: SdkErrorCode): string {
  return SDK_ERROR_HINTS[code];
}

export function apiKeyHint(envVar: string): string {
  return `Set ${envVar} in the environment, or, with the CLI, in a .env file in the project directory.`;
}

function codeOf(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  return typeof error.code === "string" ? error.code : undefined;
}

function missingKeyHint(error: unknown): string | undefined {
  return error instanceof ProviderError &&
    error.code === "MISSING_API_KEY" &&
    error.envVar !== undefined
    ? apiKeyHint(error.envVar)
    : undefined;
}

function hintOfCode(code: string): string | undefined {
  return Object.hasOwn(HINTS_BY_CODE, code) ? HINTS_BY_CODE[code] : undefined;
}

function causeOf(error: unknown): unknown {
  return error instanceof Error ? error.cause : undefined;
}

function causeHint(error: unknown): string | undefined {
  const cause = causeOf(error);
  const code = codeOf(cause);
  return missingKeyHint(cause) ?? (code === undefined ? undefined : hintOfCode(code));
}

function configLoadHint(error: unknown): string | undefined {
  const code = codeOf(causeOf(error));
  return code !== undefined && MODULE_RESOLUTION_CODES.has(code)
    ? CONFIG_IMPORT_UNRESOLVED_HINT
    : undefined;
}

function wrappedErrorHint(code: string, error: unknown): string | undefined {
  if (code === "PROVIDER_CONSTRUCTION_FAILED") {
    return causeHint(error);
  }
  return code === "CONFIG_INVALID" ? configLoadHint(error) : undefined;
}

function inputOf(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("input" in error)) {
    return undefined;
  }
  return typeof error.input === "string" ? error.input : undefined;
}

function inputFileHint(code: string, error: unknown): string | undefined {
  const input = inputOf(error);
  if (input === undefined || !Object.hasOwn(INPUT_FILE_HINTS, input)) {
    return undefined;
  }
  const hints: Readonly<Record<string, string>> = INPUT_FILE_HINTS[input as InputFileKind];
  return Object.hasOwn(hints, code) ? hints[code] : undefined;
}

/**
 * Returns the next step that resolves an error verbatra raised: one short imperative sentence,
 * such as "Set GEMINI_API_KEY in the environment, or, with the CLI, in a .env file in the project
 * directory." or
 * "Run `verbatra init` to create a config, or pass the path of an existing config file.".
 *
 * Every {@link SdkErrorCode}, every {@link ProviderErrorCode}, and every {@link AdapterErrorCode}
 * has a hint. The error is matched by its `code` property, and an error about a file an import
 * reads also by its `input` property, so a plain object carrying the same properties, such as the
 * `{ code, message }` error of a failed watch run, gets the same hint as the error it was built
 * from. A
 * `PROVIDER_CONSTRUCTION_FAILED` error takes the hint of the provider error it wraps, so a missing
 * key names the exact environment variable to set, and a `CONFIG_INVALID` error caused by a config
 * file whose import could not be resolved says to install or fix that import. A
 * `SOURCE_UNREADABLE` or `SOURCE_INVALID` error about the file {@link importWorkbook} or
 * {@link importTmx} was asked to read names that file rather than the source locale file. A code
 * verbatra does not know, or a value with no string `code`, has no hint.
 *
 * A hint is built from fixed text and, for a missing key, the name of the environment variable
 * (a {@link ProviderError}'s `envVar`). It never contains an API key value, and never quotes the
 * error's message or a file's contents.
 *
 * @param error - Anything caught from a verbatra call.
 * @returns The next step, or `undefined` when there is none for this error.
 *
 * @example
 * ```ts
 * import { errorHint, translate } from "@verbatra/sdk";
 *
 * try {
 *   await translate({ config });
 * } catch (error) {
 *   const hint = errorHint(error);
 *   if (hint !== undefined) {
 *     console.error(`next: ${hint}`);
 *   }
 * }
 * ```
 */
export function errorHint(error: unknown): string | undefined {
  const code = codeOf(error);
  if (code === undefined) {
    return undefined;
  }
  if (error instanceof GlossaryNotConfiguredError) {
    return NO_GLOSSARY_HINT;
  }
  return (
    inputFileHint(code, error) ??
    wrappedErrorHint(code, error) ??
    missingKeyHint(error) ??
    hintOfCode(code)
  );
}
