---
"@verbatra/cli": patch
---

Exit `verbatra mcp` with code 0 when the MCP client closes stdin.

Previously the command waited only for an interrupt, so a client that disconnected by closing
stdin left it with nothing to wait on, and Node exited 13 with an unsettled top-level await
warning. It now settles when the server closes, releases any held locale locks, and exits 0, the
same as `verbatra-mcp`. When an interrupt's close of the server fails, the command exits 1 whether
the client disconnects before or after that close settles, and an interrupt that arrives after the
client already disconnected keeps the clean exit 0.
