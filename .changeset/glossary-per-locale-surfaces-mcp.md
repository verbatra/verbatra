---
"@verbatra/mcp": minor
---

Return the full per-locale glossary from `glossary.get` and edit it through `glossary.write`.

`glossary.get` used to return a flat `entries` map. It now returns `version`, `terms` (each with
its translation for all locales, per-locale `targets`, `forbidden` renderings, `caseSensitive`,
`note` and `partOfSpeech`) and `doNotTranslate`, and with an optional `locale` also `effective`,
the terms a translation into that locale is held to. `glossary.write` takes `locale`,
`forbidden`, `note`, `partOfSpeech`, `caseSensitive` and `doNotTranslate` besides `term` and
`translation`, which is now optional. A locale that is not a configured target locale fails with
`UNKNOWN_LOCALE`. A glossary term named `__proto__`, `constructor` or `prototype` is no longer
dropped from the result.
