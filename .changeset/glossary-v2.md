---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Glossary version 2: per-locale translations, forbidden renderings and do-not-translate terms.

**Glossary file**
- `{ "version": 2, "terms": [...], "doNotTranslate": [...] }`: each term takes a `target`,
  `targets` per locale, `forbidden` renderings per locale, `caseSensitive`, `note` and
  `partOfSpeech`. A version 1 flat map keeps working and keeps its memory fingerprint.
- A request carries only its locale's terms, so editing one locale's terms leaves the memory of the
  others valid.

**Translation and review**
- LLM providers receive forbidden renderings, terms to keep and notes. DeepL and Google report
  `GLOSSARY_IGNORED` for what they cannot apply.
- `GLOSSARY_TERM_MISSED` checks each locale's own translation, and the new
  `GLOSSARY_FORBIDDEN_TERM` review reason flags a forbidden rendering.

**SDK**
- `readGlossaryFile` and `updateGlossaryTerm` return the normalized `Glossary`, and
  `updateGlossaryTerm` takes the new term fields and `locale`.
- New: `glossaryForLocale`, `normalizeGlossary`, `readCurrentGlossary`,
  `editConfiguredGlossaryTerm`, `redactGlossary`, and `glossaryHits` for the terms a text uses.
- `keyValue` returns the key's `description` from the source file.
- A glossary lock that cannot be created or released is reported as `GLOSSARY_UNWRITABLE`.
