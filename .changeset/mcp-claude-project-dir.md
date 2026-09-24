---
"@verbatra/mcp": minor
---

Default the project directory to `CLAUDE_PROJECT_DIR` when no `--cwd` is given.

Previously the server always fell back to the directory it was started in, so Claude Code
launched from a subdirectory of the project found no config. Claude Code sets
`CLAUDE_PROJECT_DIR` to the project root for the servers it spawns, and `verbatra-mcp`,
`verbatra mcp`, and `startMcpServer` now use it when it names an existing directory. An explicit
`--cwd` (or `cwd` option) always wins. The rule is exported as `resolveServerCwd`.
