---
"@verbatra/mcp": minor
---

Record values written through `translation.editEntry` as agent-authored.

An edit through the MCP server is recorded with the origin `agent` in `verbatra.provenance.json`,
so it is told apart from one a person made. The `key.value` and `lock.state` output schemas accept
the provenance fields the SDK reports for each key.
