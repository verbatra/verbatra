# Tool reference

## Tools

| Tool | RPC method | Availability | What it does |
| --- | --- | --- | --- |
| `verbatra_project_snapshot` | `project.snapshot` | always | Read the resolved config and this session's capabilities. Call it first. |
| `verbatra_status_check` | `status.check` | always | Per locale, how many keys are missing, stale or up to date, and who wrote the current values (`provenance`). |
| `verbatra_status_diff` | `status.diff` | always | Per locale, the exact keys the next run would add, re-translate or orphan, and the origin of each changed key's current value. |
| `verbatra_glossary_get` | `glossary.get` | always | Read every term with its shared and per-locale translations, forbidden renderings, note and part of speech, what each target locale is held to (`byLocale`), and the terms kept untranslated. Takes no parameters. |
| `verbatra_glossary_write` | `glossary.write` | always | Change one term: `translation`, per-`locale` translation and `forbidden`, `note`, `partOfSpeech`, `caseSensitive`, or `doNotTranslate`. `null` clears a field. Calls no provider. |
| `verbatra_lock_state` | `lock.state` | always | Read the lock baseline and the per-locale counts it implies, plus who wrote each locale's current values (`provenance`). |
| `verbatra_history_list` | `history.list` | always | Recent git commits touching the source or a target locale file, each with its hash, author name (never the email), author date, subject and touched paths. An unavailable result carries a `reason`. Subjects and author names are scrubbed for API keys, and `truncated` can be set (see [TRAPS.md](TRAPS.md)). |
| `verbatra_history_keyRevisions` | `history.keyRevisions` | always | The git commits in which one key's value changed in one target locale, newest first: `commit`, `author` (the name, never the email), `authorDate`, `subject`, `value`, `origin`, `sourceChanged` and a word-level `diff` from the previous value. Takes `locale` and `key`; optional `limit`. `workingTree` is the uncommitted value on disk when it differs from HEAD. Read-only, no provider call. See [TRAPS.md](TRAPS.md). |
| `verbatra_key_integrity` | `key.integrity` | always | Whether one key's value keeps the source placeholders and inline markup, stays valid ICU, and has ICU plural, ordinal and select arms that fit the target language, per locale. Optional `locales`. |
| `verbatra_locale_integrity` | `locale.integrity` | always | Every translation that fails those same checks right now, per target locale, in one call. Judges every key present in both the source and the locale, whatever its sync state, and lists only the failing ones. Optional `locales`. |
| `verbatra_review_queue` | `review.queue` | always | Every value a provider, the translation memory, a fuzzy match or an agent wrote that no person has approved, from the committed files, with its `provenance` and the last run's reason codes. Optional `includeApproved`. |
| `verbatra_review_approve` | `review.approve` | always | Record, only on the user's instruction, that a named person accepts one key's current translation. Requires `expectedValue` and `reviewer`. No provider call. |
| `verbatra_review_reject` | `review.reject` | always | Record, only on the user's instruction, that a named person refuses one key's current translation, removing it so it gets replaced. Requires `expectedValue` and `reviewer`. No provider call. |
| `verbatra_usage_summary` | `usage.summary` | always | Token usage and budget figures recorded by the last run. |
| `verbatra_usage_history` | `usage.history` | always | Read the local run history, newest first, read-only with no provider call: one record per run that finished and left a trace, so a run that aborted with an error may leave none, with counts, tokens and `cost` only, never a key or a text. Optional `limit` (default and cap set by the tool). A record may have no `basis`; a `cost` whose `pricing` is not `priced` carries no amount, so report it as no rate or unknown, never free and never "not billed": `no-usage` means the provider reported no tokens and may still have charged, and `not-billed` means verbatra does not price that provider, which may still bill if it is a hosted endpoint; a `cost` with the `USAGE_PARTIAL` caveat is a lower bound on the figures present (tokens, or the amount when priced), so say at least. `unavailable` or `unreadableRecords` mean an empty list is not proof that no run happened. |
| `verbatra_key_value` | `key.value` | always | Source and target text for exactly one key in one locale, with the key's translator `description` and who wrote the target (`provenance`). |
| `verbatra_key_context` | `key.context` | always | What a translator needs for one key in one locale: source, target, `description`, `provenance`, the glossary terms that apply, and the key's `maxLength` when the config or `verbatra.limits.json` sets one (`maxLengthSource` says `config` or `limits-file`; the config wins), plus `limitsNotice` when the limits file could not be used. Optional `draft` adds a `draftCheck` against those terms. |
| `verbatra_locale_values` | `locale.values` | always | Source and target text of many keys at once, page by page: optional `locales`, and either exact `keys` or a case-insensitive `query` over key name, source and target. Optional `limit` and `cursor`. |
| `verbatra_translation_editEntry` | `translation.editEntry` | always | Write a known translation for one key in one locale, recorded as written by an agent. It checks no length budget; follow the limits rule in [TRAPS.md](TRAPS.md). No provider call. |
| `verbatra_translation_estimate` | `translation.estimate` | always | Price what a pending run would send, per locale and in total. No provider call, no key read. |
| `verbatra_translation_retranslateEntry` | `translation.retranslateEntry` | spend gated | Ask the provider for a fresh translation of one key in one locale; it writes and spends before it returns a `limitsNotice`; follow the limits rule in [TRAPS.md](TRAPS.md), and tell the user when `reviewReasons` holds `MAX_LENGTH_EXCEEDED`. |
| `verbatra_translation_translatePending` | `translation.translatePending` | spend gated | Translate every missing or stale key in one run, optionally only some `locales` and under a `maxTokens` ceiling. |

Every tool here has a stdio counterpart under its dotted method name, but the
shapes are not always the same: the stdio server's `key.integrity` nests the
verdicts in an `entries` list. `verbatra_history_keyRevisions` and the stdio
`history.keyRevisions` run the same SDK call, so the same locale, key and limit
give the same shape of answer on both; the stdio server's `--redact-values` mode, which this
surface lacks, is the main difference; the stdio server also scrubs its whole
serialized result for keys, which this surface does not. Do not carry a result shape from one surface to the other.
