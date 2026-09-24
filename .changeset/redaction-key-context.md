---
"@verbatra/sdk": patch
---

Recognize more DeepL key contexts and stop redacting Slovak locale tokens.

Previously a bare DeepL Pro key was only scrubbed after `DeepL-Auth-Key `, `auth_key`, or
`DEEPL_API_KEY`, so `DEEPL_AUTH_KEY=`, `authKey:`, `"deeplKey":`, `DeepL-Auth-Key:` without a
space, `--auth-key`, a URL-encoded `auth_key%3D`, and JSON serialized into a string with `\"`
quotes all leaked it. Any `sk-` run of eight characters was redacted, which rewrote Slovak paths
and keys such as `locales/sk-SK_formal.json` or `sk-banner_headline`.

Now `redact` accepts those names and separators. A token with a known OpenAI or Anthropic key
prefix (`sk-ant-`, `sk-proj-`, `sk-svcacct-`, `sk-admin-`) is always redacted, and any other `sk-`
token is redacted once it holds at least 32 letters and digits across its segments, which covers
legacy OpenAI keys. Short Slovak paths and keys stay readable, but a long camelCase key such as
`sk-onboardingWelcomeScreenPrimaryButton` is redacted. A configured key value is also scrubbed in
its JSON-escaped form.
