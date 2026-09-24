---
"@verbatra/cli": minor
---

Tell the user what a long-running `mcp`, `studio` or `watch` session is doing.

Previously `verbatra mcp` printed nothing at all, `studio` printed only its URL, and `watch` never
said it was idle or that it had stopped.

Now `mcp` writes `verbatra MCP server running on stdio (project ., spend tools off)` to stderr,
explains how to launch and inspect it when started by hand in a terminal, and prints a stopped
line. These lines come from `@verbatra/mcp`, with a plain ready line when an older `@verbatra/mcp`
lacks them. `studio` reports whether spend and agent tools are on, prints a stopped line, and
with the new `--verbose` flag forwards one stderr line per request with the session token masked,
never the startup banner. `watch` prints `waiting for changes...` after every run and `stopped` at
the end. stdout and `--json` output are unchanged.
