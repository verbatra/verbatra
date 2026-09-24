---
"@verbatra/sdk": patch
---

Redact an `sk-` key after a JSON escape or an underscore, and keep a bare known prefix readable.

Previously `redact` missed an `sk-` key that followed a JSON escape such as `\n` in serialized
text, or a word character such as `_`, so a key inside a JSON-encoded message could reach an
agent or a browser tab. It also redacted a known prefix with nothing after it, such as
`sk-admin-panel_title` or `sk-proj-`.

Now an `sk-` token counts as a key whenever no letter or digit directly precedes it, a JSON escape
included, and a known prefix is redacted only when at least 20 letters and digits follow it.
