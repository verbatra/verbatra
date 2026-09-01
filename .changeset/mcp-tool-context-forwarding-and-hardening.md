---
"@verbatra/mcp": minor
---

Fix several MCP tools (`lock.state`, `key.integrity`, `review.queue`,
`usage.summary`) silently ignoring an injected `fs` or `adapterRegistry` from
the tool context instead of forwarding it to the sdk call. Fix CLI argument
parsing swallowing the next flag as a value for `--cwd` or `--config` when none
was given. Mark `glossary.write` as destructive, since passing a null
translation deletes a term. Strip working-directory-rooted absolute paths from
error messages returned to the client, and fix `key.integrity` to keep a
checked-but-unchanged locale's row instead of dropping it.
