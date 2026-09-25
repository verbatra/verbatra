---
"@verbatra/mcp": patch
---

Lead every failed MCP tool call with its error code, and refuse an unknown key in `key.integrity`.

Previously only an SDK error's text started with its code, so a provider failure from
`translation.retranslateEntry` carried its message without `RATE_LIMITED` or whichever provider
code it had, and `key.integrity` for a key the source does not have returned empty rows, as if
the key were checked and unchanged.

Now a provider or format adapter error starts with its code the same way, such as
`RATE_LIMITED: ...`, and `key.integrity` fails with `UNKNOWN_KEY` for a key the source lacks.
