---
"@verbatra/sdk": patch
---

Record the `id` of the provider that answered in `verbatra.provenance.json`.

Previously a `machine` record always named the configured provider and model, so a custom
`createProvider` that returned `id: "my-provider"` under a `gemini` config was recorded as `gemini`.

Now `translate`, `watch`, plural generation, and `retranslateEntry` record the resolved
`TranslationProvider.id`. The configured model is kept when that `id` matches the configured
provider and dropped when it does not, since the model belongs to the configured provider.
