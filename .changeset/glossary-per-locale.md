---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Add a version 2 glossary with per-locale translations, forbidden renderings and terms to keep.

Previously the glossary was one flat map of source term to translation, sent unchanged to every
target locale, so a term could not be translated differently for German and French, a wrong
rendering could not be ruled out, and a brand name could only be kept by mapping it to itself.

A glossary, in its file or inline in the config, can now be `{ "version": 2, "terms": [...],
"doNotTranslate": [...] }`. Each term takes a `target` for every locale, `targets` per locale
(falling back to the base language, then to `target`), `forbidden` renderings per locale,
`caseSensitive`, a `note` and a `partOfSpeech`. A version 1 flat map keeps working unchanged and
keeps its translation-memory fingerprint. A request now carries only the terms of its target
locale, and each locale's cache fingerprint covers only its own terms, so editing one locale's
translation no longer invalidates the others. An LLM provider receives forbidden renderings,
terms to keep and notes as data; DeepL and Google Cloud Translation report `GLOSSARY_IGNORED`
for translations and kept terms they cannot apply. The system rules that carry these instructions
are longer, so `--estimate` now reserves 550 tokens per request for them instead of 450.

`GLOSSARY_TERM_MISSED` is now checked against each locale's own translation and also covers a
dropped do-not-translate term, the new `GLOSSARY_FORBIDDEN_TERM` review reason flags a forbidden
rendering, and `EQUALS_SOURCE` no longer flags a source made only of terms to keep. Both apply to
`translate`, `retranslateEntry`, `exportWorkbook` and `check --qa`. Term matching folds case by
each locale's rules.

Breaking for SDK callers: `readGlossaryFile` and `updateGlossaryTerm` now return the normalized
`Glossary` instead of a flat term map, `updateGlossaryTerm` also takes `locale`, `forbidden`,
`note`, `partOfSpeech`, `caseSensitive` and `doNotTranslate`, its `translation: null` now removes
only the shared translation and drops the term once nothing else is left, and
`TranslateRequest.glossary`, seen by a custom provider, is now a `LocaleGlossary`. New exports:
`glossaryForLocale`, `normalizeGlossary`, `sharedGlossaryTranslations` and the glossary types.
