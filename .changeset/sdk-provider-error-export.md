---
"@verbatra/sdk": patch
---

Export `ProviderError` and its `ProviderErrorCode` type.

Previously the reference told a caller to catch the `ProviderError` that `retranslateEntry` throws,
but the class came from a private package, so the only test was `error.name === "ProviderError"`.
It is now exported from `@verbatra/sdk`, so `error instanceof ProviderError` works and `code` is
typed.
