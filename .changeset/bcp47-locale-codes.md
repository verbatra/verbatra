---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Validate `sourceLocale` and `targetLocales` as BCP 47 locale codes when the config loads.

Previously any non-empty string was accepted, so a typo such as `en_US`, `pt-br-x` or `german`
only failed later, at a provider or in a path layout.

Now every locale code must be a well-formed BCP 47 tag that `Intl.getCanonicalLocales` accepts,
with a two- or three-letter language subtag. An invalid code fails with `CONFIG_INVALID`, naming
the field and the code. `doctor` gains an informational `locale-codes` check that names every valid
but non-canonical code, such as `zh-hant-tw` or the deprecated `iw`, with its canonical form. Such
a code keeps working as written, and no file is renamed.

The `posix` locale style now also spells a script or a numeric region, joined with underscores in
the configured case as ICU and Java do: `zh-Hant-TW` becomes `zh_Hant_TW` and `es-419` becomes
`es_419`. Previously both were refused. A locale with a variant is still refused.

Compatibility: these configs loaded before and are now rejected.

- An underscore spelling such as `pt_BR`, `zh_Hant_TW` or `es_419`. The error suggests your own
  spelling with hyphens: write `pt-BR` and set `files.localeStyle` to `posix`, and every file keeps
  its old path. Before renaming, run `translate` until `check` is clean: lock-file and
  translation-memory entries recorded under the old code are not carried over to the new one.
  Existing translations in the files are kept and nothing is retranslated.
- In an `apple-xcstrings` catalogue, translations are keyed by locale code inside the file, so
  switching from `pt_BR` to `pt-BR` adds a new `pt-BR` localization block (the code Xcode uses)
  rather than reusing the `pt_BR` one.
- A language subtag of five to eight letters, such as `german`, or any other code `Intl` rejects,
  such as `x` or `en-US-`.
