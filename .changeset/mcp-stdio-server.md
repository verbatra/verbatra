---
"@verbatra/mcp": minor
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Add `@verbatra/mcp`, a stdio MCP server that exposes verbatra's translation status,
glossary, and editing capabilities as tools for any MCP client (Claude Desktop, Claude
Code, Cursor, and others), without a browser, a port, or a served single-page app.

13 tools, mapped to the SDK's read and write flows: `project.snapshot`, `status.check`,
`status.diff`, `glossary.get`, `glossary.write`, `lock.state`, `key.integrity`,
`key.value`, `translation.editEntry`, `review.queue`, and `usage.summary` are always
advertised; `translation.retranslateEntry` and `translation.translatePending`, the two
tools that call a translation provider and spend against your API usage, are advertised
only when the server is started with spending allowed. Each tool's input and, where the
result shape is small and closed, output schema is a JSON Schema (draft 2020-12) derived
from the same zod schema used to validate the call, so there is one source of truth for
both. An unknown tool name is a JSON-RPC error; a valid tool called with input that fails
validation returns a result with `isError: true` naming the offending field, not a
JSON-RPC error. Every tool result and log line passes through the same secret-redaction
pass a configured provider key value can never reach: nothing but valid MCP protocol
messages is ever written to stdout, and all logs and diagnostics go to stderr.

`@verbatra/mcp` ships two entry points backed by one implementation: a library export,
`startMcpServer(options)`, and a `verbatra-mcp` binary an MCP client can spawn directly.
It depends only on `@verbatra/sdk`, `@modelcontextprotocol/sdk`, and `zod`, never on
`@verbatra/studio` or `@verbatra/cli`, and is published and versioned independently of
the `@verbatra/sdk`/`@verbatra/cli` fixed pair, the same way `@verbatra/studio` is.

`@verbatra/cli` adds a new `mcp` command (`verbatra mcp [--cwd <path>] [--config <path>]
[--allow-spend]`) that loads `@verbatra/mcp` through a dynamic import, the same pattern
`studio` already uses, so a missing `@verbatra/mcp` never breaks the rest of the CLI; it
only fails the `mcp` command with an install hint.

`@verbatra/sdk` adds `redact`, the secret-scrubbing utility `@verbatra/mcp`'s glossary
tools and `@verbatra/studio` both use to strip provider API key shapes and any currently
configured provider environment variable value out of a string before it reaches a
caller. `@verbatra/studio` now imports this from `@verbatra/sdk` instead of its own
internal copy; its behavior is unchanged.
