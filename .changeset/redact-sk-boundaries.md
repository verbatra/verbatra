---
"@verbatra/sdk": patch
---

Redact an `sk-` key after a JSON escape, an underscore, a percent-encoded character, or an ANSI
color sequence, and keep short prefixed Slovak keys readable.

Previously `redact` missed an `sk-` key that followed a JSON escape such as `\n` in serialized
text, a word character such as `_`, a percent-encoded character such as `%3D` or `%20`, or an ANSI
color sequence such as `\x1b[31m` (or its JSON form `\u001b[31m`), so such a key could reach an
agent, a terminal, or a browser tab. It also redacted a known prefix with little after it, such as
`sk-admin-panel_title`, `sk-proj-`, or `sk-proj-settings_account_billing_title`.

Now an `sk-` token counts as a key whenever no letter or digit directly precedes it, any of those
escapes and sequences included, and it is redacted once at least 32 letters and digits follow
`sk-`, whatever its prefix.
