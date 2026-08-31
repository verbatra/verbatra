---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Add Apple `.stringsdict` plural support to the `apple-strings` format (slice 2 of
Apple format support; slice 1 was the `.strings` adapter). A `.strings` file's
sibling `.stringsdict` (same directory, same base name, `.stringsdict` extension) is
now read and merged into the same `LocaleResource`, with no config change required:
plurals are still addressed through the single `apple-strings` format id.

Each CLDR plural category (`zero`, `one`, `two`, `few`, `many`, `other`) present in
a `.stringsdict` entry becomes its own translatable entry, keyed with the same
`<key>_<category>` suffix convention `i18next-json` already uses (for example
`photo_count_one`, `photo_count_other`). A locale that supplies only some
categories, which is the common case since most languages need only `one` and
`other`, round-trips with exactly those categories: none is fabricated for a
target and none is dropped from the source. Printf placeholders inside a plural
category's format string (`%d`, `%1$@`, and so on) reuse the same extractor as
`.strings` values and are guarded across translation identically.

Writing a `.stringsdict` for a locale whose `.lproj` directory or whose file does
not exist yet creates them rather than raising, matching the `.strings` adapter's
existing behavior. When a destination `.stringsdict` already exists, its
non-translatable structure (`NSStringLocalizedFormatKey`, the substitution
variable name, and `NSStringFormatValueTypeKey`) is preserved; only category text
is updated, and a category or plural key no longer present in the entries is
dropped.

Malformed input raises a structured `AdapterError` naming the file and the
offending key: invalid XML, a missing `%#@variable@` substitution (a missing
plural rule), an unsupported `NSStringFormatSpecTypeKey`, or an unsupported plural
category. A `<!DOCTYPE>` with an internal subset or any `<!ENTITY>` declaration is
rejected before parsing; the standard external-reference-only Apple plist
`<!DOCTYPE>` that every real `.stringsdict` file carries is left untouched.
