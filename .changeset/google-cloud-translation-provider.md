---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Add `google-translate`, a sixth translation provider, for Google Cloud Translation
Basic (v2). It is a machine-translation API, like DeepL, not a language model: it
implements `translateBatch` directly rather than going through the shared
`runLlmTranslation` layer, has no `model` field, no output-token limit, and no
glossary support in v1.

Reads `GOOGLE_TRANSLATE_API_KEY`, a plain API key, from the environment only, the
same as every other hosted provider. This provider deliberately targets the Basic
(v2) tier rather than Advanced (v3): v3 authenticates with a service account or
Application Default Credentials, which the single-string environment-variable key
model does not support.

A configured `tone` or `glossary` is never applied (Cloud Translation Basic has
neither), and always reports the existing `FORMALITY_DOWNGRADED` or
`GLOSSARY_IGNORED` notice rather than failing or silently dropping the setting.
Placeholder- and ICU-bearing entries are withheld and reported with the existing
`PLACEHOLDER_UNSUPPORTED` notice, the same withhold-and-notice behavior DeepL uses,
never sent to the API and mangled. Source and target locale codes are validated as
well-formed BCP-47 before any network call.

Failures are classified into the existing structured `ProviderError` codes.
Google's API reuses HTTP 403 for both quota and credential failures, distinguished
by the response body's reason, so a 403 naming a quota reason (a daily or
per-minute limit) is raised as the retriable `RATE_LIMITED`, not `AUTH_FAILED`; a
plain 403 or 401 is `AUTH_FAILED`, naming `GOOGLE_TRANSLATE_API_KEY` and never a
key value.

Registered end to end: the SDK's provider factory table and config schema, config
authoring types (`defineConfig`), `verbatra init` scaffolding (env example and
config template), and the CLI's `--provider` option and help text.
