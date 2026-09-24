---
"@verbatra/mcp": minor
---

Report why the integrity gate withheld each key in the `translation.translatePending` and
`translation.estimate` results.

Previously a `translation.translatePending` result listed withheld keys without saying why. Each
locale now carries `integrityRefusals`, one `{ key, reason, details? }` per key the integrity gate
refused, declared in both tools' output schemas, and the `translation.translatePending`
description tells the agent to read it.
