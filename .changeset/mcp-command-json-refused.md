---
"@verbatra/cli": patch
---

Refuse `verbatra mcp --json` without writing to stdout.

Previously `verbatra mcp --json` failed as an unknown option and, because `--json` was on the
command line, printed an `ok: false` JSON envelope to stdout, the stream an MCP client reads as
protocol messages.

Now it exits 2 with a single `USAGE_ERROR` line on stderr explaining that `mcp` takes no `--json`,
without commander's own `unknown option` line, and stdout stays empty.
