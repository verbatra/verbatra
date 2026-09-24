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
 *   file could not be resolved or parsed, including one that declares an unsupported version.
 *   Thrown by {@link loadConfig} and {@link loadConfigWithMeta}, by {@link readGlossaryFile}, and
 *   by {@link updateGlossaryTerm}, which additionally throws it for an edit with a blank field, an
 *   edit that sets no field or combines fields that cannot go together, an edit that would leave
 *   an invalid glossary, and an edit whose result would exceed the glossary file size limit.
 *   {@link importTmx} and {@link exportTmx} throw it when the source locale and a target locale are
 *   the same language tag once case and separators are normalized, since a TMX segment could not be
 *   attributed to either. {@link importWorkbook} does not throw it: when a handoff sheet or file
 *   names a locale that is not a configured target locale, it records this code on that locale's
 *   {@link LocaleSummary} instead. A non-dry-run {@link translate} and {@link retranslateEntry}
 *   also throw it, before any provider is constructed, when `VERBATRA_NETWORK_POLICY` or
 *   `VERBATRA_NETWORK_ALLOWED_HOSTS` holds a value that is not valid, so a mistyped pin fails
 *   closed instead of allowing every host.
 * - `UNKNOWN_FORMAT`: no adapter is registered for the configured format. Thrown by every entry
 *   point that selects an adapter, before any file is read. {@link doctor} is the exception: it
 *   reports an unresolvable format as a failed `format-adapter` check instead, since reporting that
 *   is the command's job.
 * - `UNKNOWN_LOCALE`: a requested locale is not among the configured target locales. Thrown through
 *   the shared locale selection by {@link translate}, {@link watch}, {@link check}, {@link diff},
 *   {@link keyIntegrity}, {@link lockState}, {@link localeValues}, {@link exportWorkbook},
 *   {@link exportTmx}, {@link importTmx}, {@link keyValue}, {@link editEntry},
 *   {@link retranslateEntry}, {@link approveEntry}, and {@link rejectEntry}. {@link translate} throws it before anything is
 *   read or spent, and {@link watch} once at startup, before any watching begins.
 * - `UNKNOWN_KEY`: the requested key is not present in the source resource. Thrown by
 *   {@link keyValue}, {@link editEntry}, {@link retranslateEntry}, {@link approveEntry}, and
 *   {@link rejectEntry}.
 * - `KEY_PROTECTED`: {@link retranslateEntry} refused to replace a value a person wrote, imported,
 *   or changed outside verbatra, because neither its `includeHuman` input nor the config's
 *   `humanEdits: "overwrite"` allowed it.
 * - `KEY_PINNED`: the key matches the config's `pinnedKeys`, so a machine write was refused. Thrown
 *   by {@link retranslateEntry}, and by {@link editEntry} for an `agent` actor.
 * - `PROVIDER_CONSTRUCTION_FAILED`: the provider factory threw. Wraps the provider's own error,
 *   including a missing `*_API_KEY` environment variable. Thrown by a non-dry-run
 *   {@link translate} and by {@link retranslateEntry}.
 * - `MACHINE_TRANSLATION_DISABLED`: the config sets `provider: { id: "none" }`, so machine
 *   translation is disabled by policy and a provider-spending action was refused before any
 *   provider was constructed or any API key read. Thrown by {@link retranslateEntry} and by
 *   {@link assertMachineTranslationEnabled}. {@link translate} and {@link watch} do not throw it:
 *   in human-only mode they fill from the translation memory alone and report every other key as
 *   `unfilled` on its {@link LocaleSummary}.
 * - `NETWORK_POLICY_VIOLATION`: the effective network policy, from the config's `network` block and
 *   the `VERBATRA_NETWORK_POLICY` environment variable, does not permit the provider's endpoint or
 *   the proxy it would use. Thrown by a non-dry-run {@link translate}, by {@link watch} at startup,
 *   and by {@link retranslateEntry}, before the provider is constructed, any API key is read, or
 *   any request is sent. A request that is refused later, for instance because a host name
 *   resolved to a public address or a response redirected to a refused host, is a provider failure
 *   with the same code, recorded on the {@link LocaleSummary} rather than thrown.
 * - `SOURCE_UNREADABLE`: the source locale file is absent. Thrown by every entry point that reads
 *   the source, including {@link importWorkbook}, and by {@link watch} at startup.
 *   {@link importWorkbook} and {@link importTmx} additionally throw it when the handoff or TMX file
 *   itself is missing.
 * - `SOURCE_INVALID`: the source locale file, or an interchange file, could not be parsed. Wraps
 *   the adapter or reader error. {@link pseudolocalize} also throws it when, for a format whose
 *   writer only patches an existing document, the source file could not be copied to seed the
 *   output.
 * - `LOCK_FILE_INVALID`: the lock-file exists but is corrupt, oversized, or at an unsupported
 *   version. Thrown wherever the lock-file is read or updated: {@link translate}, {@link check},
 *   {@link diff}, {@link keyIntegrity}, {@link lockState}, {@link loadLockFile},
 *   {@link exportWorkbook}, {@link importWorkbook}, {@link editEntry}, {@link retranslateEntry},
 *   {@link approveEntry}, and {@link rejectEntry}.
 * - `PROVENANCE_FILE_INVALID`: the provenance file (`verbatra.provenance.json`) exists but is
 *   corrupt, oversized, or structurally wrong. A file from a newer verbatra is not this error: it is
 *   left untouched, {@link translate}, {@link watch}, and {@link importWorkbook} report it as the
 *   notice `PROVENANCE_VERSION_UNRECOGNIZED`, and a single-key edit records nothing. Thrown
 *   wherever the provenance file is written, checked before anything else is: {@link translate},
 *   {@link watch}, {@link importWorkbook}, {@link editEntry}, {@link retranslateEntry}, {@link approveEntry}, and
 *   {@link rejectEntry}, and by {@link loadProvenance}. The reports ({@link check}, {@link diff}, {@link lockState},
 *   {@link keyValue}, {@link localeValues}) never throw it; they leave their provenance fields out.
 * - `PROVENANCE_FILE_UNWRITABLE`: a review decision could not be recorded, because the provenance
 *   file was written by a newer verbatra or recording the decision would grow it past the size
 *   verbatra reads back. Thrown by {@link approveEntry} and {@link rejectEntry} before anything is
 *   written, since a decision that is not saved must not be reported as made.
 * - `REVIEW_VALUE_CHANGED`: the target value is no longer the one the reviewer saw, because the
 *   key has no translation in the target locale or its translation differs from the expected
 *   value. Thrown by {@link approveEntry} and {@link rejectEntry}; reload the value and review it
 *   again.
 * - `REVIEW_SOURCE_CHANGED`: the source text changed since the key's translation was written, so
 *   the value cannot be approved as it stands. Thrown by {@link approveEntry}; edit or retranslate
 *   the key first.
 * - `REVIEW_REJECT_UNSUPPORTED`: the configured format keeps a key's translation in the file when
 *   verbatra writes the file without it, so {@link rejectEntry} cannot remove the value. XLIFF,
 *   where a unit without a target reads as its source text, and Flutter ARB, whose writer keeps
 *   every existing message, are such formats. It is also thrown when the locale file is too large to
 *   keep a copy to restore. The locale file is left as it was, and nothing else is written.
 * - `REVIEW_RESTORE_FAILED`: {@link rejectEntry} failed after it changed the locale file or the
 *   provenance file, and putting a changed file back failed as well. Only a file that differs from
 *   its copy taken before the rejection is restored or named. The message names the original
 *   failure, which is also the error's `cause`, and the files that may no longer match the
 *   lock-file; restore them from version control. A failure that changed no file is thrown as is.
 * - `REVIEWER_INVALID`: the reviewer name is empty, longer than 64 characters, or contains a
 *   control character. Thrown by {@link approveEntry} and {@link rejectEntry} before anything is
 *   read.
 * - `LOCK_CONTENDED`: a write lock could not be acquired before its timeout elapsed, because
 *   another process holds it or a killed process left the lock file behind. The message
 *   names the lock file's path. Thrown by {@link editEntry}, {@link retranslateEntry},
 *   {@link approveEntry}, and {@link rejectEntry}, which act on one locale, and by {@link updateGlossaryTerm}, which takes the project's glossary lock.
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
 *   budget applies, whether configured or passed as the run's own `maxTokens`. The ceiling itself
 *   would still hold, but which locale loses its remaining work would depend on the order the
 *   locales interleave, so the same project would not produce the same run twice. A dry run is
 *   exempt, since it never consults the budget.
 * - `MAX_TOKENS_INVALID`: the per-run `maxTokens` input is not a whole number of at least 1. Thrown
 *   by {@link translate} before anything is read, written, or spent.
 * - `TARGET_UNWRITABLE`: a target locale file could not be written, because its directory is not
 *   writable, does not exist, is read-only, or is out of space. The message names the target file
 *   relative to `cwd` and the underlying file-system code, never the internal temporary file the
 *   atomic write uses. Thrown by {@link editEntry}, {@link retranslateEntry}, and
 *   {@link rejectEntry}, which act on one locale, and by {@link pseudolocalize} for the pseudolocale file. {@link translate} and {@link importWorkbook} do not throw it: they record it on that
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
 * - `TYPES_OUTPUT_CONFLICT`: {@link generateTypes} refused its output path. Before anything is
 *   read or written, it refuses a path that names no file, is absolute, climbs out of the working
 *   directory, or does not end in `.ts`, `.mts` or `.cts`, and one naming a configured locale
 *   file, the lock file, the provenance file, the translation-memory cache, a file verbatra
 *   searches for its configuration, the configuration file the run loaded, or the glossary file the config names,
 *   compared case-insensitively and, through a file-system port that implements `realpath`, again
 *   after symbolic links are resolved. A generating run, never a `check` run, also refuses to
 *   replace an existing file there that does not begin with the header line verbatra writes, and
 *   leaves that file untouched.
 * - `TYPES_UNWRITABLE`: the declaration file {@link generateTypes} produces could not be written,
 *   because its directory is not writable, does not exist, or the disk is out of space. The
 *   message names the file relative to `cwd` and the underlying file-system code.
 * - `TMX_OUTPUT_CONFLICT`: {@link exportTmx} refused its output path. Before the memory is read
 *   or anything is written, it refuses a path that names no file or resolves outside the working
 *   directory or to the working directory itself, and one naming a configured locale file, the
 *   lock file, the provenance file, the translation-memory cache, a file verbatra searches for its
 *   configuration, the configuration file the run loaded, or the glossary file the config names,
 *   compared case-insensitively and, through a file-system port that implements `realpath`, again
 *   after symbolic links are resolved.
 * - `TMX_UNWRITABLE`: the TMX file {@link exportTmx} produces could not be written, because its
 *   directory is not writable, a directory already sits at that path, or the disk is out of space.
 *   The message names the file relative to `cwd` and the underlying file-system code.
 * - `EXPORT_OUTPUT_CONFLICT`: {@link exportWorkbook} refused its output path. Before anything is
 *   read or written, it refuses a path that resolves outside the working directory, and one that,
 *   or a file the export would write into it, names a configured locale file, the lock file, the
 *   provenance file, the translation-memory cache, a file verbatra searches for its configuration,
 *   the configuration file the run loaded, or the glossary file the config names, compared
 *   case-insensitively and, through a file-system port that implements `realpath`, again after
 *   symbolic links are resolved. An `xlsx` path is also refused when it names no file or names the
 *   working directory itself.
 * - `EXPORT_UNWRITABLE`: the handoff {@link exportWorkbook} produces could not be written, because
 *   its directory is not writable, a directory or file already sits in the way, or the disk is out
 *   of space. The message names the file relative to `cwd` and the underlying file-system code, and
 *   the file-system error is the `cause`.
 * - `LOCALE_FAILED`: never thrown. It is the fallback code recorded on a failed
 *   {@link LocaleSummary} when a per-locale failure carries no code of its own.
 */
export type SdkErrorCode =
  | "CONFIG_NOT_FOUND"
  | "CONFIG_INVALID"
  | "UNKNOWN_FORMAT"
  | "UNKNOWN_LOCALE"
  | "UNKNOWN_KEY"
  | "KEY_PROTECTED"
  | "KEY_PINNED"
  | "PROVIDER_CONSTRUCTION_FAILED"
  | "MACHINE_TRANSLATION_DISABLED"
  | "NETWORK_POLICY_VIOLATION"
  | "SOURCE_UNREADABLE"
  | "SOURCE_INVALID"
  | "LOCK_FILE_INVALID"
  | "PROVENANCE_FILE_INVALID"
  | "PROVENANCE_FILE_UNWRITABLE"
  | "REVIEW_VALUE_CHANGED"
  | "REVIEW_SOURCE_CHANGED"
  | "REVIEW_REJECT_UNSUPPORTED"
  | "REVIEW_RESTORE_FAILED"
  | "REVIEWER_INVALID"
  | "LOCK_CONTENDED"
  | "GLOSSARY_NOT_FILE_BACKED"
  | "GLOSSARY_UNWRITABLE"
  | "LOCALE_LAYOUT_INVALID"
  | "LOCALE_PATH_COLLISION"
  | "CONCURRENCY_INVALID"
  | "CONCURRENCY_BUDGET_CONFLICT"
  | "MAX_TOKENS_INVALID"
  | "TARGET_UNWRITABLE"
  | "PSEUDO_OUTPUT_CONFLICT"
  | "SOURCE_UNWRITABLE"
  | "EXTRACT_NOT_CONFIGURED"
  | "EXTRACT_FS_UNSUPPORTED"
  | "TYPES_OUTPUT_CONFLICT"
  | "TYPES_UNWRITABLE"
  | "TMX_OUTPUT_CONFLICT"
  | "TMX_UNWRITABLE"
  | "EXPORT_OUTPUT_CONFLICT"
  | "EXPORT_UNWRITABLE"
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
 * carrying a stable {@link SdkErrorCode}, except the few a flow's `@throws` names as passed through
 * unwrapped (a watcher factory that throws); per-locale failures, provider notices, and integrity
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
