/**
 * The stable, structured failure codes the SDK throws. Branch on {@link SdkError.code} rather than
 * on a message; the messages are written for humans and are not part of the contract.
 *
 * A code never carries a secret. API keys are read from the environment by the providers alone, so
 * the SDK never holds one, and provider, adapter, and core errors are secret-free before the SDK
 * wraps them.
 *
 * - `CONFIG_NOT_FOUND`: no config file was found by search, or an explicit `configPath` does not
 *   exist. Thrown by {@link loadConfig} and {@link loadConfigWithMeta}. {@link doctor} narrows it
 *   to the explicit-path case: a config that is only absent from the search is reported as a failed
 *   check instead, since reporting that is the command's job.
 * - `CONFIG_INVALID`: a config was found but is unparseable or fails validation, or its glossary
 *   file could not be resolved or parsed. Thrown by {@link loadConfig} and
 *   {@link loadConfigWithMeta}, by {@link readGlossaryFile}, and by {@link updateGlossaryTerm},
 *   which additionally throws it for a blank term or translation and for an edit whose result would
 *   exceed the glossary file size limit. {@link importWorkbook} does not throw it: when a handoff
 *   sheet or file names a locale that is not a configured target locale, it records this code on
 *   that locale's {@link LocaleSummary} instead.
 * - `UNKNOWN_FORMAT`: no adapter is registered for the configured format. Thrown by every entry
 *   point that selects an adapter, before any file is read. {@link doctor} is the exception: it
 *   reports an unresolvable format as a failed `format-adapter` check instead, since reporting that
 *   is the command's job.
 * - `UNKNOWN_LOCALE`: a requested locale is not among the configured target locales. Thrown through
 *   the shared locale selection by {@link translate}, {@link watch}, {@link check}, {@link diff},
 *   {@link keyIntegrity}, {@link lockState}, {@link exportWorkbook}, {@link keyValue},
 *   {@link editEntry}, and {@link retranslateEntry}. {@link translate} throws it before anything is
 *   read or spent, and {@link watch} once at startup, before any watching begins.
 * - `UNKNOWN_KEY`: the requested key is not present in the source resource. Thrown by
 *   {@link keyValue}, {@link editEntry}, and {@link retranslateEntry}.
 * - `PROVIDER_CONSTRUCTION_FAILED`: the provider factory threw. Wraps the provider's own error,
 *   including a missing `*_API_KEY` environment variable. Thrown by a non-dry-run
 *   {@link translate} and by {@link retranslateEntry}.
 * - `SOURCE_UNREADABLE`: the source locale file is absent. Thrown by every entry point that reads
 *   the source, including {@link importWorkbook}, and by {@link watch} at startup.
 *   {@link importWorkbook} additionally throws it when the handoff file itself is missing.
 * - `SOURCE_INVALID`: the source locale file, or an interchange file, could not be parsed. Wraps
 *   the adapter or reader error.
 * - `LOCK_FILE_INVALID`: the lock-file exists but is corrupt, oversized, or at an unsupported
 *   version. Thrown wherever the lock-file is read or updated: {@link translate}, {@link check},
 *   {@link diff}, {@link keyIntegrity}, {@link lockState}, {@link loadLockFile},
 *   {@link exportWorkbook}, {@link importWorkbook}, {@link editEntry}, and
 *   {@link retranslateEntry}.
 * - `LOCK_CONTENDED`: a write lock could not be acquired before its timeout elapsed, because
 *   another process holds it or a killed process left the lock file behind. The message
 *   names the lock file's path. Thrown by {@link editEntry} and {@link retranslateEntry}, which
 *   act on one locale, and by {@link updateGlossaryTerm}, which takes the project's glossary lock.
 *   {@link translate} and {@link importWorkbook} do not throw it: they record it
 *   on the contended locale's {@link LocaleSummary} and carry on with the other locales.
 * - `GLOSSARY_NOT_FILE_BACKED`: the loaded config's glossary is written inline or absent, so there
 *   is no glossary file to read or rewrite. Thrown by {@link readGlossaryFile} and
 *   {@link updateGlossaryTerm}, which work on a file-backed glossary alone and never rewrite the
 *   config module itself.
 * - `GLOSSARY_UNWRITABLE`: the glossary file could not be written, because it or its directory is
 *   read-only, has been removed, or the disk is out of space. Thrown by
 *   {@link updateGlossaryTerm}.
 * - `LOCALE_LAYOUT_INVALID`: the configured `files.pattern` and `files.localeStyle` cannot be
 *   combined, or the style has no valid path spelling for a configured locale. Thrown by
 *   {@link createLocalePathResolver}, and so by every entry point that maps a locale to a path,
 *   before any file is read and before any provider call. {@link doctor} is the exception: it
 *   reports the resolver's failure as a failed `source-file` check instead.
 * - `LOCALE_PATH_COLLISION`: two configured locales resolve to the same absolute path, which would
 *   make the path-to-locale direction ambiguous and let two locale workers race on one file. Thrown
 *   at the same point as `LOCALE_LAYOUT_INVALID`.
 * - `CONCURRENCY_INVALID`: the `concurrency` input is not an integer of at least 1. Thrown by
 *   {@link translate} before any locale runs, and by {@link watch} once at startup, before any
 *   watching begins, since the value is fixed for the session rather than re-read per run.
 * - `CONCURRENCY_BUDGET_CONFLICT`: a live run requested a `concurrency` above 1 while a token
 *   budget is configured. The two are mutually exclusive because concurrency makes the budget's
 *   stop guarantee nondeterministic. A dry run is exempt, since it never consults the budget.
 * - `TARGET_UNWRITABLE`: a target locale file could not be written, because its directory is not
 *   writable, does not exist, is read-only, or is out of space. The message names the target file
 *   relative to `cwd` and the underlying file-system code, never the internal temporary file the
 *   atomic write uses. Thrown by {@link editEntry} and {@link retranslateEntry}, which act on one
 *   locale. {@link translate} and {@link importWorkbook} do not throw it: they record it on that
 *   locale's {@link LocaleSummary} and carry on with the other locales.
 * - `PSEUDO_OUTPUT_CONFLICT`: {@link pseudolocalize} was asked to generate a pseudolocale that
 *   names a configured locale, or to write one onto a configured locale file. Refused before
 *   anything is read or written, so a generated pseudolocale can never overwrite a real
 *   translation or stand in for one.
 * - `SOURCE_UNWRITABLE`: the source locale file could not be written. Thrown by {@link extract}
 *   alone, since it is the only entry point that writes the source locale. The `xliff` and
 *   `apple-xcstrings` formats reach it when no catalog exists yet, because neither is created from
 *   nothing.
 * - `EXTRACT_NOT_CONFIGURED`: {@link extract} was called with a config that carries no `extract`
 *   block, so there is no framework to look for and no source root to walk.
 * - `EXTRACT_FS_UNSUPPORTED`: {@link extract} was given a `deps.fs` that implements no
 *   `readDirectory`, so no source file can be discovered. The member is optional on {@link SdkFs}
 *   precisely so an implementation written before extraction existed keeps compiling; this is the
 *   error it gets if it is then handed to {@link extract}.
 * - `LOCALE_FAILED`: never thrown. It is the fallback code recorded on a failed
 *   {@link LocaleSummary} when a per-locale failure carries no code of its own.
 */
export type SdkErrorCode =
  | "CONFIG_NOT_FOUND"
  | "CONFIG_INVALID"
  | "UNKNOWN_FORMAT"
  | "UNKNOWN_LOCALE"
  | "UNKNOWN_KEY"
  | "PROVIDER_CONSTRUCTION_FAILED"
  | "SOURCE_UNREADABLE"
  | "SOURCE_INVALID"
  | "LOCK_FILE_INVALID"
  | "LOCK_CONTENDED"
  | "GLOSSARY_NOT_FILE_BACKED"
  | "GLOSSARY_UNWRITABLE"
  | "LOCALE_LAYOUT_INVALID"
  | "LOCALE_PATH_COLLISION"
  | "CONCURRENCY_INVALID"
  | "CONCURRENCY_BUDGET_CONFLICT"
  | "TARGET_UNWRITABLE"
  | "PSEUDO_OUTPUT_CONFLICT"
  | "SOURCE_UNWRITABLE"
  | "EXTRACT_NOT_CONFIGURED"
  | "EXTRACT_FS_UNSUPPORTED"
  | "LOCALE_FAILED";

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function stringCode(error: unknown): string | undefined {
  if (error instanceof Error && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  return undefined;
}

export function describeError(
  error: unknown,
  fallbackCode: string,
): { code: string; message: string } {
  return { code: stringCode(error) ?? fallbackCode, message: errorMessage(error) };
}

/**
 * The single structured error the SDK throws. Every whole-run failure surfaces as an `SdkError`
 * carrying a stable {@link SdkErrorCode}; per-locale failures, provider notices, and integrity
 * findings are reported as data on the {@link RunSummary} instead of being thrown.
 *
 * An `SdkError` never carries a secret in its message.
 */
export class SdkError extends Error {
  /** The stable {@link SdkErrorCode} for this failure. Branch on this, not on the message. */
  readonly code: SdkErrorCode;

  /**
   * @param code - The stable failure code.
   * @param message - A human-readable description of the failure. Never contains a secret.
   * @param options - `cause` carries the error this one wraps, such as the interchange reader's
   * error for a `SOURCE_INVALID` TMX file. Read that file's line, column and unit with
   * `tmxErrorLocation` rather than from the cause directly.
   */
  constructor(code: SdkErrorCode, message: string, options?: { readonly cause?: unknown }) {
    super(message, options);
    this.name = "SdkError";
    this.code = code;
  }
}
