---
"@verbatra/mcp": minor
---

Print a ready line and a stopped line from the `verbatra-mcp` binary.

Previously `verbatra-mcp` wrote nothing to stderr unless a tool call failed, so a person who
started it by hand saw a silent process.

Now it writes `verbatra MCP server running on stdio (project ., spend tools off)` to stderr on
start, adds how to launch and inspect it when stdin is a terminal, and writes
`verbatra MCP server stopped (...)` when the client closes stdin or the process is interrupted.
stdout still carries only MCP messages.
