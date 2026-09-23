---
"@verbatra/mcp": patch
---

Accept the new provenance fields in the `key.value` and `lock.state` output schemas.

Previously both tools declared strict output schemas, so the provenance an updated SDK adds to
their results would have failed schema validation. `key.value` now allows an optional
`provenance` object and each `lock.state` locale an optional `provenance` summary.
