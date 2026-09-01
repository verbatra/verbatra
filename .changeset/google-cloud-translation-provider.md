---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Add `google-translate`, a new translation provider, for Google Cloud Translation
Basic (v2). Like DeepL, it is a machine-translation API rather than a language
model, with no tone control and no glossary support in v1; it reads
`GOOGLE_TRANSLATE_API_KEY` from the environment. Entries containing
placeholders or ICU syntax are withheld and reported rather than sent to the
API. Registered end to end: the provider factory table, config schema,
`verbatra init` scaffolding, and the CLI `--provider` option.
