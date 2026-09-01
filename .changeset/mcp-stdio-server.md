---
"@verbatra/mcp": minor
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Add `@verbatra/mcp`, a new stdio MCP server exposing verbatra's translation
status, glossary, and editing capabilities as tools for MCP clients such as
Claude Desktop, Claude Code, and Cursor. Ships 13 tools covering status checks,
glossary editing, key integrity, and translation editing; the two tools that
call a provider and spend API usage are only advertised when the server is
started with spending allowed. Ships both a library export (`startMcpServer`)
and a `verbatra-mcp` binary, versioned and published independently of
`@verbatra/sdk`/`@verbatra/cli`. `@verbatra/cli` gains a new `mcp` command that
loads it via dynamic import, so a missing `@verbatra/mcp` install never breaks
the rest of the CLI. `@verbatra/sdk` also gains a shared `redact` utility, used
to strip provider API key values out of tool output before it reaches a caller.
