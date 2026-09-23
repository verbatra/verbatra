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

Compatibility: these configs loaded before and are now rejected.

- An underscore spelling such as `pt_BR` or `en_US`. Write `pt-BR` and set `files.localeStyle` to
  `posix` to keep `pt_BR` in file names. Existing translations in the file are kept and nothing is
  retranslated, but lock-file and translation-memory entries recorded under `pt_BR` are not carried
  over to `pt-BR`.
- A language subtag of five to eight letters, such as `german`, or any other code `Intl` rejects,
  such as `x` or `en-US-`.
