---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Add `redactGlossary`, `readCurrentGlossary` and `editConfiguredGlossaryTerm` for glossary tools.

`redactGlossary` passes every source term, translation, forbidden rendering, note, part of speech
and term kept untranslated of a glossary through `redact` and names the terms that had a value
replaced, a redacted source term itself as `[REDACTED]`, so a tool can show a glossary without
leaking a secret-shaped value.

`readCurrentGlossary` reads the glossary a loaded config names as it is now; pass the result to
`glossaryForLocale` for one locale's view. `editConfiguredGlossaryTerm` is `updateGlossaryTerm`
with its locale checked against the configured target locales, failing with `UNKNOWN_LOCALE`
naming the configured ones.
