---
"@verbatra/mcp": patch
---

Return the key's `description` from `key.value`.

`key.value` now returns `description` when the source file carries one, such as an ARB
`@key.description` or an XLIFF note: the context a source file gives translators for a key.
