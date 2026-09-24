---
"@verbatra/sdk": patch
---

Recognize DeepL keys by their context instead of redacting every UUID, and match `sk-` keys by
their length instead of their prefix.

Previously `redact` treated any hex UUID as a DeepL key, so a file path or an id containing one
became unreadable in an error message, a CLI line, or a Studio or MCP result. Any `sk-` run of eight
characters after a word boundary was redacted, which rewrote Slovak paths and keys such as
`locales/sk-SK_formal.json` or `sk-banner_headline`, while an `sk-` key that followed a JSON escape
such as `\n` in serialized text, an underscore, a percent-encoded character such as `%3D` or `%20`,
or an ANSI color sequence such as `\x1b[31m` (or its JSON form `\u001b[31m`) was missed.

Now a DeepL key is recognized by its shape only when it carries the `:fx` suffix of a free key, or
when a bare UUID sits in a key context: after `DeepL-Auth-Key` (with or without a space or a
colon), as an `auth_key`, `authKey` or `deeplKey` field or parameter (URL-encoded as `auth_key%3D`
too, and inside JSON serialized into a string with `\"` quotes), after `--auth-key`, or assigned to
`DEEPL_API_KEY` or `DEEPL_AUTH_KEY`. A Pro key held in `DEEPL_API_KEY` is still scrubbed everywhere
by its value. An `sk-` token counts as a key whenever no letter or digit directly precedes it, any
of those escapes and sequences included, and it is redacted once at least 32 letters and digits
follow `sk-`, whatever its prefix, which covers every OpenAI and Anthropic key shape. Short Slovak
paths and keys such as `sk-proj-settings_account_billing_title` stay readable, but a long camelCase
key such as `sk-onboardingWelcomeScreenPrimaryButton` is redacted. A configured key value is also
scrubbed in its JSON-escaped form.
