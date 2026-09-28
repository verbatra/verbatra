---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Add a fast, key-free check of one locale file: `verbatra check --file <path>` and `checkFile()`.

Previously the only way to validate a hand-edited locale file was `verbatra check --qa`, which reads
every locale of the project, and a file that no longer parsed aborted the whole run.

Now `check --file` reads only the named file and, for a target locale, the source locale file. It
reports the same per-locale result as `check --qa` (integrity errors for placeholders, inline markup
and ICU, review warnings, plurals missing CLDR categories) and turns a file that does not parse into
a `syntax` finding with the adapter's code and, for JSON and YAML, its line and column, instead of
failing. The source locale file is checked for syntax alone. It writes nothing, reads no lock-file
and calls no provider. It exits 1 on an error finding (and on warnings under `--strict`) and 2 with
the new `NOT_A_LOCALE_FILE` code for a path that is not a locale file of the project. It cannot be
combined with `--locales` or `--consistency`.

`AdapterError` gains a `position` (line and column) for malformed JSON and YAML, and its message
names the same position, for every command that reports such a file.
