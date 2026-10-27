# Traps specific to this surface

- An edit is immediate and has no undo on this surface. An accepted
  `verbatra_translation_editEntry` writes the locale file and its lock entry at
  once, replacing the previous value.
- `verbatra_translation_translatePending` is not idempotent and not all or
  nothing. Its optional `locales` narrows the run and its optional `maxTokens` is a
  hard ceiling: requests that would cross it are withheld and their keys listed
  under `budgetWithheld`. A second call bills again for whatever is still
  pending, and a run that fails partway can leave some locales written and others
  untouched. Only one run may be in flight, so a concurrent second call is refused
  rather than queued.
- A configured locale DeepL or Google Cloud Translation does not list makes the
  estimate and both spend-gated tools fail with `LOCALE_UNSUPPORTED_BY_PROVIDER`
  before anything is sent or billed. Retry with the other locales in `locales`, or
  ask the human; never change the config's `localeMap` to get past it.
- `verbatra_usage_summary` reads a snapshot only a real translation run
  refreshes; an unavailable result means no run has ever recorded one, not zero
  usage. `verbatra_review_queue` is built from the committed files, so every
  teammate sees the same queue; an unavailable result means the provenance file
  is corrupt or from a newer verbatra, not an empty queue. A key leaves the
  review queue once its value is approved or rejected, or a person rewrites or
  imports it. A key you fixed with `verbatra_translation_editEntry` stays listed,
  because an agent's edit still needs a person's review.
- Protected keys are left for a person. A stale value a person wrote, imported or
  changed outside verbatra, and any key matching `pinnedKeys`, is skipped by
  `verbatra_translation_translatePending` and listed under each locale's
  `protected`; `verbatra_translation_retranslateEntry` refuses it with
  `KEY_PROTECTED` or `KEY_PINNED`, and `verbatra_translation_editEntry` refuses a
  pinned key with `KEY_PINNED`. Report them rather than editing around them.
- `verbatra_key_integrity` lists a locale only while the key counts as changed
  there. Absence is not a pass and not a failure. Each listed locale carries
  `hasPlaceholders`, `matches`, the `missing` and `extra` placeholders, `icuValid`,
  `icuArmsMatch` with one short problem per wrong arm in `icuArmDetails`, and
  `markupMatches` with `markupDetails`, never the full source or target text. Unlike
  the stdio server's `key.integrity`, the fields sit on the locale itself, with no
  `entries` list.
- `verbatra_locale_integrity` answers differently from `verbatra_key_integrity`.
  It returns each locale with an `entries` list holding only failing keys, each
  with its `key` and the same verdict fields, so an empty list means every
  translation in that locale passes. A missing key has no translation to judge
  and never appears. An explicitly empty `locales` array is rejected.
- `verbatra_key_context` judges a `draft` by the same rules a translate run uses
  to flag a translation for review: for each applying term whether the draft uses
  the required translation and which forbidden renderings it contains, and for
  each term to keep untranslated whether the draft kept it. A clean `draftCheck`
  is not the integrity gate; `verbatra_translation_editEntry` still runs that.
  Respect `maxLength` when it is present. When the glossary file cannot be read,
  the glossary part is empty and `glossaryNotice` carries the error's `code` and
  `message`; the rest of the result is still answered, so do not read an empty
  glossary as "no terms apply" while a notice is present.
- `verbatra_translation_translatePending` reports each key the integrity gate
  refused under its locale's `integrityRefusals` (`key`, a `reason` of
  `placeholder`, `markup`, `icu`, `degenerate` or `empty`, and `details` when one
  part is at fault). The previous value stayed. A locale whose state was recorded
  under an old spelling of its code is moved over first
  (`LOCALE_STATE_CARRIED_OVER`), or, when that move could not happen, reports
  `LOCALE_STATE_CARRY_OVER_SKIPPED` and may fail with
  `LOCALE_STATE_NOT_CARRIED_OVER` without running.
- The config's `sensitiveData` guard can keep keys from the provider: under
  `block`, or under `redact` when a match cannot be masked and restored,
  `verbatra_translation_translatePending` lists them under each locale's
  `sensitiveWithheld` (the locale ends `partial` or `failed`), and
  `verbatra_translation_retranslateEntry` fails with
  `SENSITIVE_CONTENT_WITHHELD`. Report the keys; never move the content
  elsewhere to get past the guard, and never add it to `sensitiveData.allow` or
  turn a detector off unless the human asked.
- `verbatra_lock_state` compares against the recorded lock baseline;
  `verbatra_status_check` compares the locale files themselves. A key with no lock
  baseline can never be reported stale, which is why a project without a committed
  lock file silently stops noticing that the source text changed.
- `verbatra_locale_values` returns at most `limit` entries per call (default
  200, at most 1,000) as `locales`, each a `locale` with its `entries` (`key`,
  `source`, `target` and the target's `provenance`), ordered by locale and then in
  source key order. When the result carries `nextCursor`, call again with the same
  parameters and `cursor` set to it; a cursor from other parameters, or one the
  files no longer match, is refused with `PAGE_CURSOR_INVALID`, so start again
  without it. `keys` and `query` cannot be combined.
- An absent target value means the key is not translated in that locale yet, and
  an absent source value that the key is orphaned. An empty string is a real
  stored value and no run will replace it.
- `verbatra_history_list` never follows renames, and the server caps how many
  commits it returns regardless of the `limit` you ask for. An unavailable result
  is not an empty history: its `reason` is `git-missing`, `not-a-repository`,
  `timeout` (git log ran too long and was stopped) or `output-too-large`. Commit
  subjects and author names are user content like any other text.
- `verbatra_glossary_write` changes only the parameters you pass. `translation`
  without `locale` is the translation for all locales; with `locale`, `translation`
  and `forbidden` apply to that locale only, and `forbidden` replaces the whole
  list. `null` clears `translation`, `forbidden`, `note` or `partOfSpeech`; clearing
  the shared translation keeps the term's per-locale data, and the term disappears
  only once nothing is left. `doNotTranslate` combines with no parameter but
  `caseSensitive`. It never retranslates existing keys. Studio loads the config and
  glossary once at startup, so an edit, from this tool or on disk, shows at once in
  `verbatra_glossary_get` and `verbatra_key_context`, but the translate,
  retranslate and estimate tools use it only after Studio restarts. A glossary file or write
  lock that cannot be written fails with `GLOSSARY_UNWRITABLE`, and another writer
  holding the glossary lock past its timeout with `LOCK_CONTENDED`.
- Each term of `verbatra_glossary_get` carries `byLocale`: the translation and
  forbidden renderings each target locale is held to, and whether that translation
  is `inherited` from the base language or the shared one. Check a translation
  against that, not against `targets` alone.
- `verbatra_glossary_get` redacts values shaped like a provider API key: every
  translation, forbidden rendering, note and part of speech can come back as
  `[REDACTED]`, and `redactedTerms` names the affected terms. Never pass a redacted value back through
  `verbatra_glossary_write`: it is a placeholder, not the original text, so the
  read-modify-write loop an agent naturally reaches for destroys the real term.
  Check `redactedTerms` first and leave those terms to a human.
- Reading the `prune` setting is not optional here. Studio surfaces it on the
  Settings page and `verbatra_project_snapshot` returns it, but no tool on this
  surface passes it, so a `prune: true` project deletes orphaned keys on any run
  you start with `verbatra_translation_translatePending`, exactly as rule 5
  describes.

- `verbatra_usage_summary` and `verbatra_review_queue` showing no last run after a
  0.12 run, on `@verbatra/studio` 0.5, is an upgrade mismatch: a 0.12 run records a
  review reason the older Studio cannot read. The operator upgrades `@verbatra/studio`
  or deletes `.verbatra-local/run-status.json`.
