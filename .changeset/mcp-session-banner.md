---
"@verbatra/mcp": minor
---

Print a ready line and a stopped line from the `verbatra-mcp` binary, and export their builders.

Previously `verbatra-mcp` wrote nothing to stderr unless a tool call failed, so a person who
started it by hand saw a silent process.

Now it writes `verbatra MCP server running on stdio (project ., spend tools off)` to stderr on
start, adds how to launch and inspect it when stdin is a terminal, and writes
`verbatra MCP server stopped (...)` when the client closes stdin or the process is interrupted.
stdout still carries only MCP messages. `projectLabel`, `mcpReadyLine`, `mcpTerminalHint`,
`mcpStoppedLine` and the `McpStopCause` and `McpLaunchArgs` types are exported from the package
root, so `verbatra mcp` in the CLI prints the same lines, each naming its own launch command. The
CLI installs its interrupt handler before printing them, so a Ctrl-C right after the hint still
prints the stopped line.
