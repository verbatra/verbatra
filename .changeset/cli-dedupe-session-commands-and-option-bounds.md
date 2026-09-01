---
"@verbatra/cli": patch
---

Deduplicate shared session/spend/missing-package helper logic between the `mcp`
and `studio` CLI commands, and fix the CLI's local copy of MCP server types
drifting out of sync with `@verbatra/mcp`. `verbatra init` now derives which
providers take a model and token limit from the sdk's own metadata instead of a
hardcoded list, so it will not go stale when a new provider is added.
`--concurrency`, `--lock-timeout`, and `--debounce` now reject values above a
sane upper bound instead of accepting an unbounded number.
