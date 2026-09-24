---
"@verbatra/sdk": patch
---

Export `ProviderError` and its `ProviderErrorCode` type, and name the refused empty glossary edit
accurately.

Previously the reference told a caller to catch the `ProviderError` that `retranslateEntry` throws,
but the class came from a private package, so the only test was `error.name === "ProviderError"`.
It is now exported from `@verbatra/sdk`, so `error instanceof ProviderError` works and `code` is
typed. `updateGlossaryTerm` refused an edit with no field to set as one that "changes nothing",
although an edit that leaves the glossary as it is succeeds without writing; the message now says
the edit sets no field.
