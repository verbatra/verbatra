---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Map configured locale codes to provider language codes with `provider.options.localeMap`.

Previously every provider received the configured locale code as written, so DeepL refused a
regional source such as `en-US` and received `zh-Hant` for a Traditional Chinese target. Now every
provider except `none` accepts an optional `localeMap` from a configured locale to the code it
should receive, and a locale without an entry gets a built-in normalization: DeepL receives the
source language alone (`en-US` is sent as `EN`) and its own target variants (`zh-Hant` and `zh-TW`
as `ZH-HANT`, `zh-CN` as `ZH-HANS`, `es-MX` as `ES-419`), and Google Cloud Translation receives
`zh-TW` or `zh-CN` for a Chinese script and `no` for `nb`. File names, the lock file, and the
translation memory keep the configured codes. A non-empty `localeMap` is part of the translation
memory fingerprint, so changing it starts a separate memory bucket. Every `localeMap` key must be
a configured locale, checked as written, so a `__proto__` key in a JSON or YAML config fails with
`CONFIG_INVALID` naming it.
