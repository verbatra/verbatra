---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Add `redactGlossary` and accept a normalized glossary in `glossaryForLocale` and `normalizeGlossary`.

`redactGlossary` passes every translation, forbidden rendering, note and part of speech of a
glossary through `redact` and names the terms that had a value replaced, so a tool can show a
glossary without leaking a secret-shaped value. `glossaryForLocale` and `normalizeGlossary` now
also take the `Glossary` that `readGlossaryFile` returns.
