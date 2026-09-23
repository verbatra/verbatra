---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Add `redactGlossary`, `readCurrentGlossary` and `editConfiguredGlossaryTerm` for glossary tools.

`redactGlossary` passes every translation, forbidden rendering, note and part of speech of a
glossary through `redact` and names the terms that had a value replaced, so a tool can show a
glossary without leaking a secret-shaped value. `glossaryForLocale` and `normalizeGlossary` now
also take the `Glossary` that `readGlossaryFile` returns.

`readCurrentGlossary` reads the glossary a loaded config names as it is now, and
`editConfiguredGlossaryTerm` is `updateGlossaryTerm` with its locale checked against the configured
target locales; both fail with `UNKNOWN_LOCALE` naming the configured ones.
