---
"@verbatra/sdk": patch
---

Stop `redact` from replacing every UUID in a message.

Previously any hex UUID was treated as a DeepL key, so a file path or an id containing one became
unreadable in an error message, a CLI line, or a Studio or MCP result.

Now a DeepL key is recognized by its shape only when it carries the `:fx` suffix of a free key, or
when a bare UUID sits in a key context: after `DeepL-Auth-Key`, as an `auth_key` parameter, or
assigned to `DEEPL_API_KEY`. A Pro key held in `DEEPL_API_KEY` is still scrubbed everywhere by its
value.
