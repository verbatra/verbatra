# Error and notice code reference

## Error and notice codes

A whole-command failure exits `2` with one of these as `code`. Each code has an
entry with its next step at `https://verbatra.kreitz-webdev.de/docs/error-codes#<code>`,
the code in lower case, such as `#config_not_found`. The same codes, and
a provider's own error codes, appear on a failed locale as
`result.locales[].error.code`, where the run went on with the other locales and
exits `1`.

| Code | What it means for you |
| --- | --- |
| `CONFIG_NOT_FOUND`, `CONFIG_INVALID` | No config, or one that does not validate (including a strict `provider` block, a glossary file, or an invalid network variable). Fix the config; nothing ran. A `causeCode` such as `MODULE_NOT_FOUND` means an import in the config file could not be resolved: install that package rather than editing config fields. A `.cjs` config can `require("@verbatra/cli")`. |
| `UNKNOWN_FORMAT`, `UNKNOWN_LOCALE`, `UNKNOWN_KEY` | A format, locale or key that is not configured or not in the source. Take the values from the config. |
| `NOT_A_LOCALE_FILE` | `check --file` named a path that is no configured locale's file, or no file exists there. Pass the file `files.pattern` maps to a locale. |
| `SOURCE_UNREADABLE`, `SOURCE_INVALID`, `SOURCE_UNWRITABLE` | The source locale file (or an import file) is missing, unparseable, or, for `extract`, unwritable. |
| `LOCK_FILE_INVALID`, `PROVENANCE_FILE_INVALID`, `PROVENANCE_FILE_UNWRITABLE` | `verbatra.lock.json` or `verbatra.provenance.json` is corrupt, too large or from a newer verbatra. Restore it from version control; never delete it to get past this. |
| `LOCK_CONTENDED` | Another process holds a write lock past the timeout, took over a lock this run held, or a lock was left by another machine or an older verbatra. See the lock paragraph in [EXIT-CODES.md](EXIT-CODES.md). |
| `LOCK_TIMEOUT_INVALID` | An SDK caller passed a `lockAcquireTimeoutMs` that is not a whole number of milliseconds of at least 0. The CLI refuses a bad `--lock-timeout` first, as `INVALID_LOCK_TIMEOUT`. |
| `PAGE_CURSOR_INVALID`, `PAGE_LIMIT_INVALID` | An SDK caller of `localeValuesPage` or `provenanceReportPage` passed a cursor made under other filters or one the files no longer match, or a `limit` that is not a whole number from 1 to 1000. No CLI command pages. Call again without the cursor. |
| `RUN_CANCELLED` | An SDK caller's `signal` aborted the work: `retranslateEntry` throws it before writing anything, and `translate` records it on each locale it kept from starting and sets `cancelled: true` on the summary. The MCP server's spend tools pass the client's cancellation as that signal; the CLI and Studio pass none, and an interrupted CLI run exits `130` or `143` instead. Run again to finish what is pending. |
| `LOCALE_STATE_NOT_CARRIED_OVER` | Never thrown; a locale whose respelled state could not be moved did not run. Re-run once the other process is done. |
| `KEY_PROTECTED`, `KEY_PINNED` | A single-key machine write refused a person's value or a `pinnedKeys` key. Leave it for a person. |
| `SENSITIVE_CONTENT_WITHHELD` | A single-key retranslation in Studio or the MCP server kept the key from the provider because `sensitiveData` matched it; no CLI command raises it, since `translate` and `watch` list such keys under `sensitiveWithheld`. Report it; do not loosen `sensitiveData`. |
| `REDACTION_UNSUPPORTED` | `mcp --redact-values` found a `@verbatra/mcp` that does not confirm it redacts values, and stopped before serving anything. Upgrade `@verbatra/mcp`. |
| `MACHINE_TRANSLATION_DISABLED` | Provider `none`: a provider-spending action was refused before any key was read. |
| `PROVIDER_CONSTRUCTION_FAILED` | The provider could not be built, most often because its key variable is not set (`causeCode` `MISSING_API_KEY`). Name the variable; never ask for the value. |
| `NETWORK_POLICY_VIOLATION` | The network policy refuses the provider's host. Report it; do not loosen the policy yourself. |
| `LOCALE_UNSUPPORTED_BY_PROVIDER` | DeepL or Google Cloud Translation does not list a configured locale, so the whole run was refused before anything started or was spent. Run `doctor --locales`, then drop the locale with `--locales` or ask the human. |
| `GLOSSARY_NOT_FILE_BACKED`, `GLOSSARY_UNWRITABLE` | The glossary is inline or absent, or its file or lock could not be written. |
| `CONCURRENCY_INVALID`, `CONCURRENCY_BUDGET_CONFLICT`, `MAX_TOKENS_INVALID` | Bad `--concurrency` or `--max-tokens`, or a concurrency above `1` together with a token budget. |
| `LOCALE_LAYOUT_INVALID`, `LOCALE_PATH_COLLISION` | `files.pattern` and `files.localeStyle` do not fit, a `gettext-po` locale has a script with no gettext modifier, or two locales map to one file. |
| `TARGET_UNWRITABLE`, `TYPES_UNWRITABLE`, `TMX_UNWRITABLE`, `EXPORT_UNWRITABLE`, `MEMORY_UNWRITABLE` | The file the command writes could not be written; `MEMORY_UNWRITABLE` is `verbatra.cache.json` during `tmx import`. |
| `PSEUDO_OUTPUT_CONFLICT`, `TYPES_OUTPUT_CONFLICT`, `TMX_OUTPUT_CONFLICT`, `EXPORT_OUTPUT_CONFLICT` | The output path would overwrite a locale, lock, provenance, cache, config or glossary file, or leaves the working directory. Pick another path. |
| `EXTRACT_NOT_CONFIGURED`, `EXTRACT_FS_UNSUPPORTED` | `extract` needs an `extract` block in the config. |
| `REVIEW_VALUE_CHANGED`, `REVIEW_SOURCE_CHANGED`, `REVIEW_REJECT_UNSUPPORTED`, `REVIEW_RESTORE_FAILED`, `REVIEWER_INVALID` | Review decisions, which only a person makes. `xliff` cannot reject a value, since a unit without a target reads as its source; every other format, `arb` included, can. |
| `LOCALE_FAILED`, `CLI_ERROR` | Fallbacks for a failed locale, or a command failure, that carried no code of its own. |
| `USAGE_ERROR`, `INVALID_LOCALES`, `INVALID_LOCALE`, `INVALID_OUT`, `INVALID_FORMAT`, `INVALID_DIRECTION`, `INVALID_QA_OPTION`, `INVALID_SEVERITY`, `INVALID_CONCURRENCY`, `INVALID_MAX_TOKENS`, `INVALID_LOCK_TIMEOUT`, `INVALID_DEBOUNCE`, `INVALID_PORT` | A flag value the CLI refused before anything ran; for `init`, `INVALID_LOCALE` and `INVALID_LOCALES` come only from an interactive answer. |

The codes the CLI raises itself, as opposed to the ones it passes through from the
SDK or a provider, are exported as `CLI_ERROR_CODES` from `@verbatra/cli`: the
fallback `CLI_ERROR`, `REDACTION_UNSUPPORTED`, the flag codes in the last row above, and the `init` codes
under Setting a project up in [INIT.md](INIT.md). A script that validates a `code` can import that list
instead of copying this table.

A run that completed can still carry notices, each in
`result.locales[].notices` with a `code`: `PLURAL_CATEGORIES_INCOMPLETE`,
`SUB_BATCH_FAILED`, `BLANK_ROW_BASELINE_RETAINED`, `HANDOFF_REVIEWS_RECORDED`,
`BUDGET_TOKENS_EXCEEDED`,
`CACHE_VERSION_UNRECOGNIZED`, `PROVENANCE_VERSION_UNRECOGNIZED`,
`PROVENANCE_FILE_TOO_LARGE`, `LOCALE_STATE_CARRIED_OVER`,
`LOCALE_STATE_CARRY_OVER_SKIPPED`, and the locale support warnings
`LOCALE_UNVERIFIED_BY_PROVIDER`, `LOCALE_NOT_WELL_TESTED`,
`GLOSSARY_UNSUPPORTED_BY_PROVIDER` and `FORMALITY_UNSUPPORTED_BY_PROVIDER`,
`SOURCE_FOREIGN_PLACEHOLDERS` (source values to translate hold a placeholder-shaped
token the format does not protect), `SOURCE_VALUE_EMPTY` (source keys with an empty
value, left untranslated until their source text is written), and the sensitive content notices
`SENSITIVE_CONTENT_SENT`, `SENSITIVE_CONTENT_REDACTED` and
`SENSITIVE_CONTENT_WITHHELD`, and `RUN_CANCELLED` (an SDK or MCP run was cancelled while
the locale ran, so its unsent keys stay pending and the locale is partial),
plus the codes a provider raises. A notice is
something to report, not a failure; the exit code already says whether the run was
clean.
