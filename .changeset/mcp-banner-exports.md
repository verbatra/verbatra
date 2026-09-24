---
"@verbatra/mcp": minor
---

Export the session banner builders.

Previously the ready, terminal-hint and stopped lines were private to the `verbatra-mcp` binary,
so `verbatra mcp` in the CLI kept its own copy.

Now `projectLabel`, `mcpReadyLine`, `mcpTerminalHint`, `mcpStoppedLine` and the `McpStopCause` and
`McpLaunchArgs` types are exported from the package root, and the binary and the CLI print the
same lines, each naming its own launch command.
