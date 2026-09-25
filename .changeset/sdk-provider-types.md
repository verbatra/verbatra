---
"@verbatra/sdk": minor
---

Export the provider contract types `TranslationProvider`, `TranslateRequest`, `TranslateResult`,
`ProviderKind`, `ProviderNetwork`, `ProviderRetry`, and `ProviderRetryListener`.

A provider passed through `deps.createProvider` can now be typed against the same interface the
built-in providers implement, and the SDK reference documents each type under "Custom providers".
