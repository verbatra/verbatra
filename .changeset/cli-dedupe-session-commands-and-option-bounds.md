---
"@verbatra/cli": patch
---

Deduplicate the byte-identical session/spend/missing-package helper logic shared by
`mcp-command.ts` and `studio-command.ts` into a new `session-command-support.ts`
module, and collapse the three structurally identical `WatchSession`/`StudioSession`/
`McpSession` interfaces into one `Session` type reused across `RunHooks` and the
command modules. Import `McpServerHandle` and `StartMcpServerOptions` from
`@verbatra/mcp` instead of a hand-duplicated, already-drifted local copy that was
missing the `fs`, `adapterRegistry`, and `createProvider` fields. `init.ts` now
derives which providers take a model and token limit from the sdk's own
`scaffoldingMetadata.scaffoldModels` keys instead of hardcoding the `deepl` and
`google-translate` provider ids, so it cannot silently go stale if a future provider
is added. `--concurrency`, `--lock-timeout`, and `--debounce` now reject values above
a sane upper bound (100, 3600 seconds, and 60000 milliseconds respectively) instead
of silently accepting an unbounded number.
