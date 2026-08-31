---
"@verbatra/mcp": minor
---

Fix `lock.state`, `key.integrity`, `review.queue`, and `usage.summary` silently ignoring an injected `fs` or `adapterRegistry` from the tool context instead of forwarding it to the sdk call. Fix `bin.ts` argument parsing treating the next flag as a value for `--cwd` or `--config` when no value was actually given. Mark `glossary.write` as destructive, since passing a null translation deletes a term. Strip absolute filesystem paths rooted at the working directory from error messages returned to the MCP client, including a bare occurrence of the working directory with no trailing separator or subpath. Reword `key.integrity` to describe accurately that it only reports keys whose source text drifted since the lock baseline, and keep a checked locale's row with an empty entries list instead of dropping it, so a caller can tell a locale that was checked and found unchanged apart from one that was never checked.
