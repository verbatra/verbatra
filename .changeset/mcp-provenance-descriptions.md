---
"@verbatra/mcp": patch
---

Describe the provenance fields in the `key.value`, `lock.state`, `status.check`, and `status.diff` tools.

Previously the descriptions an agent reads said nothing about provenance. They now name the fields
each tool returns, what each origin means, and that the fields are left out when
`verbatra.provenance.json` is corrupt or from a newer verbatra.
