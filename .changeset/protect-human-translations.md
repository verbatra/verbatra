---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Protect human translations from machine overwrite when the source changes.

Previously, when a source string changed, the next `translate` or `watch` run retranslated the key
and replaced whatever the target held, including a value a translator wrote. Now a stale key whose
current value a person wrote (origin `human`), imported (`import`), or changed outside verbatra
(`external`) is kept by default: it is not sent to the provider, its value and lock-file baseline
stay as they are, so `check` keeps reporting it as stale, and it is listed in the new
`LocaleSummary.protected` with its reason. This is a behavior change for every project with such
values. To get the previous behavior back, set `humanEdits: "overwrite"` in the config, or pass
`--include-human` to `verbatra translate` for one run.

- `@verbatra/sdk`: new config fields `humanEdits` (`"protect"`, the default, `"suggest"`, or
  `"overwrite"`) and `pinnedKeys` (key patterns with `*`). Under `suggest`, a protected key is still
  sent to the provider (or served from an exact translation-memory entry, never a fuzzy one) and
  the answer comes back as `ProtectedKey.suggestion` and is kept in the translation memory, but
  never written to the locale file; `ProtectedKey.suggestionStatus` says whether a suggestion
  arrived or why not. Generated plural forms of a protected base form are held too. A key matching `pinnedKeys` is never
  translated, suggested, or retranslated, whatever `humanEdits` says. `TranslateInput.humanEdits`
  overrides the config for one run. `retranslateEntry` refuses a protected value with the new
  `KEY_PROTECTED` code unless `includeHuman` is set or the config says `overwrite`, and refuses a
  pinned key with the new `KEY_PINNED` code; `editEntry` refuses a pinned key for the `agent` actor.
  `LocaleCheckSummary.protected` and `LocaleDiff.protected` report the keys a run would leave
  alone, only the pinned ones when the provenance file cannot be read. When `verbatra.provenance.json` was written by a newer verbatra, every stale key with a
  value is protected. A dry run reads the provenance file unless `humanEdits` is `overwrite`,
  so a corrupt file fails it with `PROVENANCE_FILE_INVALID` as it fails a live run.
  `LocaleSummary.protected` is a new required field, so code that builds a `LocaleSummary` by hand
  has to add it.
- `@verbatra/cli`: `translate --include-human` retranslates protected keys for one run.
  `translate`, `check`, and `diff` list or count protected keys, and `translate` prints a hint on
  stderr when it left any. In a human-only project (`provider: { id: "none" }`), protected keys
  count toward exit code `3` like unfilled ones.
