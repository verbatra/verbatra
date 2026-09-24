---
"@verbatra/mcp": patch
---

Return the key's `description` from `key.value`.

The sdk reads the context a source file gives translators for a key, but the `key.value` output
schema dropped it, so an MCP client never saw it. `key.value` now returns `description` when the
source file carries one, such as an ARB `@key.description` or an XLIFF note.
