# Lock file and protected keys

## What the lock file means

`verbatra.lock.json` records, per locale, the content hash of the source text each
key was translated from. It is the only thing that separates the two reasons a key
needs work:

- **missing**: the key has a non-empty value in the source locale and is absent
  from the target file. It is translated on the next run.
- **stale** (reported as `changed` by `diff`): the key has a non-empty source value,
  is present in the target file, the lock has a baseline hash for it, and the
  current source text hashes differently. It is re-translated on the next run,
  overwriting the existing target value.
- **empty source**: the key's source value is empty or whitespace only (for
  `gettext-po`, the source catalog's `msgstr`), such as a key `extract` added
  without a default. Whatever the target or the lock holds, it is never missing,
  stale, up to date, `would translate` or `unfilled`, never sent to a provider,
  and `export` writes no row for it; the target keeps its value. `check` counts it
  as `emptySource` per locale, `diff` lists the keys under `emptySource`, and a
  `translate` run lists them in `result.locales[].emptySource` with the notice
  `SOURCE_VALUE_EMPTY`. It never makes `check` or `diff` exit `1`. Write the source
  text to translate it.

A key with no lock baseline can never be stale. That is the trap: delete or never
commit the lock file and verbatra stops noticing that source text changed, so
edits to English silently never reach the other locales. Commit
`verbatra.lock.json` alongside the translated files.

The second trap: an empty string is an existing value. A target key set to `""` as
a placeholder counts as present and unchanged, so a normal run never fills it in.

Nothing else is overwritten. A target value verbatra did not flag as stale is left
exactly as it is.

## Protected keys

`verbatra.provenance.json` sits next to the lock file and records, per key, who
wrote the value that is in the locale file now: `machine`, `memory`, `fuzzy`,
`agent`, `human`, `import` or `unknown` (recorded without a known author), and,
derived when the files are read, `unrecorded` (no record yet) or `external`
(changed outside verbatra since). Commit it with the lock file.

A stale key whose value a person wrote, imported or changed outside verbatra is
**protected**. The config's `humanEdits` decides what a run does with it:

- `protect`, the default: the value is kept, the key stays stale, and the run lists
  it under `result.locales[].protected` for a person.
- `suggest`: as `protect`, but the provider is also asked for a suggestion, which is
  reported and never written. That still bills the provider.
- `overwrite`: no protection; the key is retranslated like any other.

A key matching a `pinnedKeys` pattern is never machine-translated, whatever
`humanEdits` says. `translate --include-human` overrides `protect` for one run and
replaces those human values with provider output; never pass it unless the human
asked for exactly that. In a project with a provider, protected keys do not change
the exit code of `translate` (it says on stderr how many it left), but `check`
still exits `1`, because they stay stale until a person resolves them.
