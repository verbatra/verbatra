---
"@verbatra/mcp": minor
---

Record values written through `translation.editEntry` as agent-authored.

Previously an edit through the MCP server was indistinguishable from one a person made. It is now
recorded with the origin `agent` in `verbatra.provenance.json`. The `key.value` and `lock.state`
output schemas also accept the provenance fields the SDK now reports, which their strict schemas
would otherwise have rejected.
