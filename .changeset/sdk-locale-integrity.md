---
"@verbatra/sdk": minor
---

Add `localeIntegrity` and `glossaryDraftCheck`.

`localeIntegrity({ config, cwd?, locales? })` judges every key present in both the source and a
target locale, whatever its sync state, by the same placeholder, markup, ICU, and ICU arm rules as
`keyIntegrity`, and returns only the failing entries. `keyIntegrity` still judges changed keys
only. `glossaryDraftCheck({ glossary, locale, sourceLocale, source, draft })` checks a draft
translation against the glossary terms its source uses, reporting for each term whether the
required translation is used and which forbidden renderings appear, by the rules a translate run
uses for `GLOSSARY_TERM_MISSED` and `GLOSSARY_FORBIDDEN_TERM`.
