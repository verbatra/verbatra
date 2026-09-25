---
"@verbatra/sdk": minor
"@verbatra/mcp": minor
---

Bound how long the MCP write tools, `editEntry` and `updateGlossaryTerm` wait for a write lock.

`translation.editEntry`, `translation.retranslateEntry`, `translation.translatePending` and
`glossary.write` take an optional `lockTimeoutMs`, from 0 to 600000 milliseconds and 30000 when
left out, instead of waiting silently up to the SDK's ten-minute default behind another process's
lock. A call that times out fails with `LOCK_CONTENDED` and writes nothing; for
`translation.translatePending` only the contended locale fails. `editEntry` gains
`lockAcquireTimeoutMs` and `onLockWait`, and `updateGlossaryTerm` and `editConfiguredGlossaryTerm`
gain `lockAcquireTimeoutMs`; an invalid bound fails with `LOCK_TIMEOUT_INVALID` before anything is
read.
