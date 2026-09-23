---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Map configured locale codes to provider language codes with `provider.options.localeMap`.

Previously every provider received the configured locale code as written, so DeepL refused a
regional source such as `en-US` and received `zh-Hant` for a Traditional Chinese target. Now each
machine provider accepts an optional `localeMap` from a configured locale to the code it should
receive, and a locale without an entry gets a built-in normalization: DeepL receives the source
language alone (`en-US` is sent as `EN`) and its own target variants (`zh-Hant` and `zh-TW` as
`ZH-HANT`, `zh-CN` as `ZH-HANS`), and Google Cloud Translation receives `zh-TW` or `zh-CN` for a
Chinese script. File names, the lock file, and the translation memory keep the configured codes.
