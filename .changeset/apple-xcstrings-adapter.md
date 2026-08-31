---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Add `apple-xcstrings`, a tenth supported format, for Apple's Xcode String Catalog
(`.xcstrings`) files: a single JSON document holding every locale, including plural
variations and translation state, together in one file, unlike every other format
verbatra supports. `files.pattern` still requires the `{locale}` token, but it
resolves to the same catalogue path for every locale (for example
`{locale}Localizable.xcstrings` addresses one `Localizable.xcstrings` regardless of
locale); the source locale and every target locale therefore share one physical
file. A run against an `apple-xcstrings` catalogue serializes every write into that
file, including from `translate`, Studio edits, single-key retranslation, and
workbook import, so concurrency above 1 no longer runs those operations in parallel
for this format, though it still bounds provider calls for every other format as
before.

Reading a catalogue falls back to a key's own text as its value only for the
document's own declared `sourceLanguage`; every other locale's missing entry is
simply absent, exactly like a missing key in any other format's target file. Each
CLDR plural category (`zero`, `one`, `two`, `few`, `many`, `other`) present under a
locale's `variations.plural` becomes its own translatable entry, keyed with the
same `<key>_<category>` suffix convention `i18next-json`, `apple-strings`, and its
`.stringsdict` plural support already use. Printf placeholders (`%@`, `%d`, `%1$@`,
`%lld`, the escaped `%%` literal) are extracted and guarded across translation the
same way `apple-strings` values are.

A key the catalogue marks `shouldTranslate: false` is never sent to a provider. A
write patches only the localizations it touches into the existing document, so
`extractionState`, other locales, non-translatable entries, plural categories, the
catalogue `version`, and its `sourceLanguage` all survive untouched; a translated
value's `stringUnit.state` is set to `translated`, and an unchanged value's existing
`state` is left byte-identical. Malformed catalogue JSON raises a structured
`AdapterError` naming the file and, where applicable, the key and locale.
