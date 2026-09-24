---
"@verbatra/sdk": minor
---

Report a key's description from `keyValue`, and find the glossary terms a text uses with `glossaryHits`.

Previously `keyValue` returned only the source and target text, so a caller could not show a
translator the description a format such as ARB, XLIFF, gettext, Apple `.strings`, or .NET `.resx`
keeps for a key, and finding which glossary terms apply to a key meant reimplementing the matching.
`keyValue` now also returns `description` when the source file gives one, and the new
`glossaryHits(glossary, locale, sourceLocale, text)` returns the terms and terms to keep
untranslated that occur in a text as whole terms, with what the target locale is held to, using
the same matching a translate run applies.
