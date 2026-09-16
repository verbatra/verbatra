---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Add a read-only consistency report: `verbatra check --consistency`, and `consistency: true` on the SDK's `check`, list every source string that a target locale translates more than one way under different keys. Each finding names the source string, every distinct translation, and the keys holding each one, so the wording can be aligned by hand.

The report is opt-in and changes nothing else. It never changes `inSync`, a count, or the exit code, never withholds or rewrites a value, never enters `integrityMismatches`, and never adds a review reason to `needsReview`. Like the rest of `check`, it constructs no provider and needs no API key. Without the flag the output is exactly what it was.

Each `LocaleCheckSummary` carries the findings as `inconsistencies`, an array of the newly exported `InconsistencyGroup` type: `{ source, context?, description?, meaning?, isPlural, pluralForm?, translations }`, where each `InconsistentTranslation` is `{ value, keys }`.

The comparison follows one rule on both sides: values are compared after Unicode NFC normalization, folding `\r\n` to `\n`, and trimming leading and trailing whitespace, so a translation that differs only in surrounding whitespace is not a finding, while internal whitespace and letter case still count. Only up-to-date keys are compared, since a stale key's translation belongs to an older source text. Keys whose description, meaning, plural flag, or gettext `msgctxt` differ are never grouped, because that metadata exists to allow a different translation. Plural forms are compared per form: in a format that stores each form under its own key (i18next, Apple `.stringsdict` and `.xcstrings`, Android `<plurals>`, gettext `msgstr[n]`), the forms of one key are never grouped with each other, while the same form under different keys still is, and the group names that form as `pluralForm`. A translation identical to its own source is not a finding here; that remains the `EQUALS_SOURCE` review reason.

Groups are sorted by source string, translations by value, and keys by name, all by UTF-16 code unit, so the same catalog always produces the same report. The report groups keys in a single hash-map pass over the catalog.
