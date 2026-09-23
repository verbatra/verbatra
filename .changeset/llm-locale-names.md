---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Tell LLM providers the English name of the source and target language, script and region.

Previously an LLM provider saw only the locale code, and models often answered `sr-Latn` in
Cyrillic or mixed up `pt-BR` and `pt-PT`. The request payload now also carries `sourceLanguage` and
`targetLanguage`, for example `{ "name": "Serbian (Latin)", "script": "Latin" }`, resolved with
`Intl.DisplayNames` from the configured locale (not a `localeMap` value) and left out for a code
Node.js has no name for. A fixed system rule asks the model to write in the named script and
regional variant. The names travel only as request data, and the translation memory fingerprint
is unchanged, so existing memory is still reused.

The estimated fixed overhead per LLM request grows from 350 to 450 tokens of system rules, and
each request payload counts the names, so `translate --dry-run` estimates and token budget
reservations rise slightly.
