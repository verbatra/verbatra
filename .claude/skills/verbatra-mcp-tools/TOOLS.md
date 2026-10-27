# Tool reference

## Tools

The `always` rows are present in every session. The `spend gated` rows exist only
when the operator granted spend.

| Tool | Availability | What it does |
| --- | --- | --- |
| `project.snapshot` | always | Read the resolved config: whether a usable config is loaded (`configured`), source and target locales, format, path pattern, provider id, where the config and the glossary come from, `humanEdits`, `prune`, and whether values are redacted (`valuesRedacted`). Call it first. With `configured: false` only `configProblem` and `nextStep` are set. |
| `project.doctor` | always | Run the setup checks (config, format, provider, API key variable by name, network policy, source file, the provider's locale support, and informational ones): each with `status` (`pass`, `warn`, `fail`, `skipped`), `detail`, and a `fix` when it failed. `warn` is an informational finding worth attention; only `fail` makes `ok` false. `plural-completeness` is `skipped` when it did not run. Works without a usable config. No provider call, no key value read, nothing written. |
| `status.check` | always | Per target locale, how many keys are missing, stale or up to date, how many of them are `protected`, who wrote the current values (`provenance`), `emptySource`, the count of source keys with an empty value (never missing or stale, never out of sync), and `incompletePlurals`, each plural lacking CLDR categories the language uses (a warning that never changes the counts). Optional `locales`. |
| `status.diff` | always | Per target locale, the exact keys the next run would add, re-translate or orphan, the `protected` ones it would leave for a person, `changedOrigins`, and `emptySource`, the source keys with an empty value, which are not pending. Optional `locales`. |
| `glossary.get` | always | Read every term (per-locale `targets`, `forbidden` renderings, and the shared `target`, note and part of speech when set), the `doNotTranslate` terms, the format `version` and where the glossary comes from. Optional `locale` adds `effective`, the terms a translation into that locale is held to. |
| `glossary.write` | always | Change one term: `translation`, per-`locale` translation and `forbidden` renderings, `note`, `partOfSpeech`, `caseSensitive`, or `doNotTranslate`. `null` clears a field. Returns the whole glossary afterwards, or only `termCount` and `doNotTranslateCount` when values are redacted. Optional `lockTimeoutMs`. |
| `lock.state` | always | Read the lock file version and the per-locale counts it implies, plus who wrote each locale's current values (`provenance`, by origin and by review state). `emptySource` counts source keys with an empty value apart from `missing`, `stale` and `upToDate`. Reports `exists: false` before the first successful run. |
| `history.list` | always | Recent git commits that touched the source or a target locale file, newest first, each with `hash`, `author` (the name, never the email), `authorDate`, `subject` and `touchedPaths`. Optional `limit` (default 50, capped at 200). |
| `key.integrity` | always | Report one key's placeholder, inline markup, ICU syntax and ICU plural, ordinal and select arm drift against the lock baseline, per target locale. Optional `locales`. A key the source lacks fails with `UNKNOWN_KEY`. |
| `locale.integrity` | always | Every translation that fails the placeholder, markup or ICU checks right now, per target locale, in one call. Lists only failing keys. Optional `locales`. |
| `key.value` | always | Read one key's current source text, its current text in one target locale, the translator `description` the source file gives the key, and who wrote it (`provenance`). |
| `key.context` | always | What `key.value` returns, plus the glossary terms that apply to that key in that locale, the terms to keep untranslated, and the key's `maxLength` when the config sets one. Optional `draft` adds a `draftCheck` of the value you intend to write. |
| `locale.values` | always | Source and target text of many keys at once, page by page: optional `locales`, and either exact `keys` or a case-insensitive `query` over key name, source and target. Optional `limit` and `cursor`. |
| `translation.editEntry` | always | Write a manual translation for one key in one locale, recorded with origin `agent`. No provider call. Optional `lockTimeoutMs`. |
| `translation.estimate` | always | Price what `translation.translatePending` would send: a dry-run summary whose `estimate` carries keys, requests, tokens or characters per locale and in total, a `cost` when the config's rates cover the provider (`pricing` says why not), and `caveats`. No provider call, no key read. Optional `locales`. |
| `translation.retranslateEntry` | spend gated | Ask the provider for a fresh translation of one key in one locale. Optional `lockTimeoutMs`. |
| `translation.translatePending` | spend gated | Translate every missing or stale key in one run. Optional `locales`, a `maxTokens` ceiling, and `lockTimeoutMs`. Sends progress notifications when the call carries a `progressToken`. |
| `review.queue` | always | Read every value a provider, the translation memory, a fuzzy match or an agent wrote that no person has approved yet, from the committed files, with the `provenance` of each and the `reasons` the last run on this machine flagged it with. `available: false` means the provenance file is unreadable, not an empty queue. |
| `report.provenance` | always | Per target locale, how many current values fall in each provenance bucket (`machine-unreviewed`, `machine-reviewed`, `human`, `import`, `external`, `unrecorded`, `unknown`), as `verbatra report provenance` reports it. `includeEntries: true` adds the keys, optionally only for some `buckets`, page by page. Optional `locales`. |
| `review.approve` | always | Record, only on the user's explicit instruction, that a named person accepts one key's current translation. Takes `locale`, `key`, exactly one of the `expectedValue` the user reviewed or its marker's `expectedHash`, a required `reviewer`, and optional `lockTimeoutMs`. No provider call. |
| `review.reject` | always | Record, only on the user's explicit instruction, that a named person refuses one key's current translation; the value is removed so the next run replaces it. Same inputs as `review.approve`. No provider call. |
| `usage.summary` | always | Read the token usage and budget outcome left behind by the last run. |

`lockTimeoutMs` (0 to 600000, default 30000) bounds how long a writing tool waits
for a write lock another process holds; past it the call fails with
`LOCK_CONTENDED` and writes nothing (for `translation.translatePending`, only that
locale fails). A failed call's text always starts with its code, such as
`UNKNOWN_KEY: ...` or `RATE_LIMITED: ...`: branch on that prefix. When the error has a
next step, the text ends with a `Next step: ...` line, such as `Next step: Set GEMINI_API_KEY
in the environment, or, with the CLI, in a .env file in the project directory.`: relay it to the user, and
never ask for the key value it names.
