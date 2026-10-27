---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Non-interactive `init` for agents, errors with a `hint`, progress and `next:` lines, safe locks, redaction and output paths.

**Agents**
- `init` detects format, file pattern and locales, takes `--format`, `--model`, `--base-url`, `--api-key-env-var` and `--json`, and exits 2 on an ambiguous project.
- `init --agent` writes an `AGENTS.md` section and the MCP server entry, spending off, for each detected coding agent (Claude Code, Cursor, VS Code, Codex, Gemini). `--client` picks them and `--dry-run` lists every file it would write.
- `errorHint(error)` gives the next step for any error code: a `next:` line, and a `hint` in `--json`.

**Terminal and files**
- Every command shows progress on stderr, a spinner on a terminal and plain lines in CI, and ends with a `next:` hint. `-q`/`--quiet` and `--no-color` trim it. stdout and `--json` are unchanged.
- A lock left by a dead process is reclaimed instead of timing out, and `import --lock-timeout` bounds the wait.
- Everything printed is redacted, including any `apiKeyEnvVar` value. `verbatra mcp --redact-values` keeps values out of MCP results.
- `export`, `tmx export` and `pseudo --out` refuse a path outside the project or onto a project file.
