# Tool reference

Read this to pick the tool for a step, check whether it is listed in this session, and know what
it needs. What a result means is in [RESULTS.md](RESULTS.md).

- [Tools](#tools)
- [Shared inputs and errors](#shared-inputs-and-errors)
- [The limits rule](#the-limits-rule)

## Tools

The `always` rows are present in every session. The `spend gated` rows exist only when the
operator granted spend.

| Tool | Availability | What it does |
| --- | --- | --- |
| `project.snapshot` | always | Read the resolved config: whether a usable config is loaded (`configured`), source and target locales, format, path pattern, provider id, where the config and the glossary come from, `humanEdits`, `prune`, and whether values are redacted (`valuesRedacted`). Call it first. With `configured: false` only `configProblem` and `nextStep` are set. |
| `project.doctor` | always | Run the setup checks (config, format, provider, API key variable by name, network policy, source file, the provider's locale support, and informational ones): each with `status` (`pass`, `warn`, `fail`, `skipped`), `detail`, and a `fix` when it failed. Only `fail` makes `ok` false; `plural-completeness` is `skipped` when it did not run. Works without a usable config. No provider call, no key value read, nothing written. |
| `status.check` | always | Per target locale, how many keys are missing, stale or up to date, how many of them are `protected`, who wrote the current values (`provenance`), `emptySource` (source keys with an empty value, never missing or stale) and `incompletePlurals` (a warning that never changes the counts). Optional `locales`. |
| `status.diff` | always | Per target locale, the exact keys the next run would add, re-translate or orphan, the `protected` ones it would leave for a person, `changedOrigins`, and `emptySource`, which are not pending. Optional `locales`. |
| `glossary.get` | always | Read every term (per-locale `targets`, `forbidden` renderings, and the shared `target`, note and part of speech when set), the `doNotTranslate` terms, the format `version` and where the glossary comes from. Optional `locale` adds `effective`, the terms a translation into that locale is held to. |
| `glossary.write` | always | Change one term: `translation`, per-`locale` translation and `forbidden` renderings, `note`, `partOfSpeech`, `caseSensitive`, or `doNotTranslate`. `null` clears a field. Returns the whole glossary afterwards, or, when values are redacted, empty lists with `termCount` and `doNotTranslateCount`. Optional `lockTimeoutMs`. |
| `lock.state` | always | Read the lock file version and the per-locale counts it implies, plus who wrote each locale's current values (`provenance`, by origin and by review state) and `emptySource`. Reports `exists: false` before the first successful run. |
| `history.list` | always | Recent git commits that touched the source or a target locale file, newest first, each with `hash`, `author` (the name, never the email), `authorDate`, `subject` and `touchedPaths`. Optional `limit` (default 50, capped at 200). Subjects and authors are scrubbed for API keys only ([RESULTS.md](RESULTS.md#history)). |
| `history.keyRevisions` | always | Needs `@verbatra/mcp` 0.4.0 or newer; an older server does not list it. The commits in which one key's value changed in one target locale, newest first, each with its value and a word-level `diff`, plus `workingTree` when the file on disk differs from HEAD. Takes `locale` and `key`; optional `limit` (default 50, capped at 200). Read-only, no provider call. Read its flags in [RESULTS.md](RESULTS.md#history) before quoting it. |
| `key.integrity` | always | Report one key's placeholder, inline markup, ICU syntax and ICU plural, ordinal and select arm drift against the lock baseline, per target locale. Optional `locales`. A key the source lacks fails with `UNKNOWN_KEY`. |
| `locale.integrity` | always | Every translation that fails the placeholder, markup or ICU checks right now, per target locale, in one call. Lists only failing keys. Optional `locales`. |
| `key.value` | always | Read one key's current source text, its current text in one target locale, the translator `description` the source file gives the key, and who wrote it (`provenance`). |
| `key.context` | always | What `key.value` returns, plus the glossary terms that apply in that locale, the terms to keep untranslated, the key's `maxLength` and `maxLengthSource` (`config` or, from 0.4.0, `limits-file`), and `limitsNotice` when the limits file could not be used. Optional `draft` adds a `draftCheck` of the value you intend to write. |
| `locale.values` | always | Source and target text of many keys at once, page by page: optional `locales`, and either exact `keys` or a case-insensitive `query` over key name, source and target. Optional `limit` and `cursor`. |
| `translation.editEntry` | always | Write a manual translation for one key in one locale, recorded with origin `agent`. Refuses a pinned key with `KEY_PINNED` but replaces a person's value without refusing, and checks no length budget (see the limits rule). No provider call. Optional `lockTimeoutMs`. |
| `translation.estimate` | always | Price what `translation.translatePending` would send: a dry-run summary whose `estimate` carries keys, requests, tokens or characters per locale and in total, a `cost` when the config's rates cover the provider (`pricing` says why not), and `caveats`. No provider call, no key read. Optional `locales`. |
| `translation.retranslateEntry` | spend gated | Ask the provider for a fresh translation of one key in one locale. Bills the provider before the integrity gate runs and writes only when the result says `accepted: true`. Either result can carry a `limitsNotice`, a `reviewReasons` list and, from 0.4.0, the tokens the provider reported as `usage` (absent when it reports none). Optional `lockTimeoutMs`. |
| `translation.translatePending` | spend gated | Translate every missing or stale key in one run. Optional `locales`, a `maxTokens` ceiling, and `lockTimeoutMs`. Sends progress notifications when the call carries a `progressToken`. |
| `review.queue` | always | Read every value a provider, the translation memory, a fuzzy match or an agent wrote that no person has approved yet, from the committed files, with the `provenance` of each and the `reasons` the last run on this machine flagged it with. `available: false` means the provenance file is unreadable, not an empty queue. |
| `report.provenance` | always | Per target locale, how many current values fall in each provenance bucket (`machine-unreviewed`, `machine-reviewed`, `human`, `import`, `external`, `unrecorded`, `unknown`), as `verbatra report provenance` reports it. `includeEntries: true` adds the keys, optionally only for some `buckets`, page by page. Optional `locales`. |
| `review.approve` | always | Record, only on the user's explicit instruction, that a named person accepts one key's current translation. Takes `locale`, `key`, exactly one of `expectedValue` (the value the user reviewed) or `expectedHash` (its marker's hash), a required `reviewer`, and optional `lockTimeoutMs`. No provider call. |
| `review.reject` | always | Record, only on the user's explicit instruction, that a named person refuses one key's current translation; the value is removed so the next run replaces it, except in an XLIFF project (`REVIEW_REJECT_UNSUPPORTED`). Same inputs as `review.approve`. No provider call. |
| `usage.history` | always | Needs `@verbatra/mcp` 0.4.0 or newer. The local run history, newest first: counts, tokens and `cost` per finished run, never a key or a text. Optional `limit` (default and cap set by the server). Read-only, no provider call. Read [RESULTS.md](RESULTS.md#usage-and-cost) before you call any figure free or complete. |
| `usage.summary` | always | Read the token usage and budget outcome left behind by the last run. An `incomplete` field (`failed`, `partial`) means that run left locales unfinished. |

## Shared inputs and errors

`lockTimeoutMs` (0 to 600000, default 30000) bounds how long a writing tool waits for a write lock
another process holds; past it the call fails with `LOCK_CONTENDED` and writes nothing (for
`translation.translatePending`, only that locale fails).

A coded failure's text starts with its code, such as `UNKNOWN_KEY: ...` or `RATE_LIMITED: ...`:
branch on that prefix. Invalid input starts with `Invalid input for field "<name>": ...` and has no
code. When the error has a next step, the text ends with a `Next step: ...` line, such as
`Next step: Set GEMINI_API_KEY in the environment, or, with the CLI, in a .env file in the project
directory.`: relay it to the user, and never ask for the key value it names.

## The limits rule

Length limits from `verbatra.limits.json` ship from `@verbatra/mcp` 0.4.0. The rule applies to the
tools that write a translation value: `translation.editEntry`, `translation.retranslateEntry` and
`translation.translatePending`.

- **Before writing one key:** call `key.context` first, even without a `draft`, and respect the
  `maxLength` it reports.
- **Before a bulk run:** read the `limits` check of `project.doctor`. Afterwards, report any
  `LIMITS_FILE_IGNORED` notice and any `MAX_LENGTH_EXCEEDED` in `review.queue`, and tell the user
  when a `translation.retranslateEntry` result has `MAX_LENGTH_EXCEEDED` in `reviewReasons`.
- **When the budget is unknown:** a `limitsNotice` means the file is invalid, unreadable,
  unsupported or not a regular file, and its budgets are not applied. A deleted file, or a server
  older than 0.4.0 (its `serverInfo.version` at connect, or `--version` of `@verbatra/mcp`, not
  the verbatra CLI's; if neither is available, ask), gives no notice and no budgets, so a missing
  `maxLength` does not mean no limit. In each case tell the user and get the budget before
  writing.
- **The fallback:** `translation.retranslateEntry` cannot be given a budget, so have the user fix
  the file. Writing a value you checked against the budget with `translation.editEntry`, which
  enforces none, is the fallback only when the `provenance` `origin` in `key.value` or
  `key.context` is `machine`, `memory`, `fuzzy` or `agent`, or when the user says to replace it;
  for `human`, `import`, `external`, `unrecorded` or no provenance, ask first. On a server older
  than 0.4.0 fixing the file does not help, so upgrade first or use that fallback under the same
  conditions.
- **Pinned and protected keys:** a pinned key needs no pre-check, since `translation.editEntry`
  refuses it with `KEY_PINNED` (`status.diff` lists pinned keys, and stale person-written ones,
  under `protected`): relay that refusal. A protected value is otherwise replaced without any
  refusal.
- **Fixing the file:** an unreadable file is usually a permissions fix, otherwise another
  filesystem error; an invalid or non-regular file is copy-first, then fix. Limits are advisory
  and the config's `maxLength` wins per key.
