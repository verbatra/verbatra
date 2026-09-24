---
"@verbatra/sdk": patch
---

Recognize more DeepL key contexts and stop redacting Slovak locale tokens.

Previously a bare DeepL Pro key was only scrubbed after `DeepL-Auth-Key `, `auth_key`, or
`DEEPL_API_KEY`, so `DEEPL_AUTH_KEY=`, `authKey:`, `"deeplKey":`, `DeepL-Auth-Key:` without a
space, `--auth-key`, a URL-encoded `auth_key%3D`, and JSON serialized into a string with `\"`
quotes all leaked it. Any `sk-` run of eight characters was redacted, which rewrote Slovak paths
and keys such as `locales/sk-SK_formal.json` or `sk-banner_headline`.

Now `redact` accepts those names and separators, and an `sk-` token is redacted only when its
random part holds a run of at least 20 letters and digits, as every real OpenAI or Anthropic key
does. A configured key value is also scrubbed in its JSON-escaped form.
