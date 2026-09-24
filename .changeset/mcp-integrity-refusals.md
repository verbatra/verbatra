---
"@verbatra/mcp": minor
---

Declare `integrityRefusals` in the `translation.translatePending` and `translation.estimate` output schemas.

Previously each locale's refusals reached `structuredContent` but the output schema did not name
them, so a client that relied on the schema could not tell why a key was withheld. Each locale now
declares `integrityRefusals`, one `{ key, reason, details? }` per key the integrity gate refused,
and the `translation.translatePending` description tells the agent to read it.
