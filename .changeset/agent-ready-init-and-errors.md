---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Non-interactive `init` for agents, and errors with a `hint` and a `causeCode`.

**init**
- `init` detects the format, file pattern, locale style and locales from the project's files.
  Several candidates exit 2 with `FORMAT_AMBIGUOUS` or `LAYOUT_AMBIGUOUS` instead of a guess.
- New flags: `--format`, `--model`, `--base-url`, `--api-key-env-var` and `--json`.
  `openai-compatible` is supported. SDK: `detectProject`.
- Without a terminal, a missing value fails with `MISSING_OPTIONS` naming every missing flag.
- `init --agent` also writes a verbatra section into `AGENTS.md` (or an existing `CLAUDE.md` when
  there is no `AGENTS.md`) and adds the MCP server, spending off, for each coding agent it detects
  in the project: Claude Code (`.mcp.json`), Cursor (`.cursor/mcp.json`), VS Code
  (`.vscode/mcp.json`), Codex (`.codex/config.toml`) and Gemini CLI (`.gemini/settings.json`), or
  only Claude Code when it finds none. `--client claude,cursor,vscode,codex,gemini` (or `all`)
  picks them instead, and `agent.clients` in `--json` reports each one. Other servers keep their
  bytes, indentation and line endings when the file has one entry per line; otherwise it is
  rewritten with the same content. The Codex table is appended to the end of the file, which is
  otherwise left as it is. Gemini CLI reads `GEMINI.md`, so a next step says how to make it load
  the instruction file. `@verbatra/cli` exports the entries as `AGENT_CLIENT_CONFIGS`.
- A detected client whose config path runs through a symbolic link is skipped with a next step;
  init never writes through one.
- `init --agent` leaves `.mcp.json` alone while the verbatra Claude Code plugin is enabled in
  `.claude/settings.json` or `.claude/settings.local.json`, and says so in the next steps.
- Run in a project that already has a config, `init --agent` keeps the config and adds only the
  agent files (`agent.configKept` in `--json`).
- `init --dry-run` reports every file it would write or change, and writes nothing.
- An unpaired or repeated verbatra marker, a client file that is not plain JSON (comments and
  trailing commas included), does not hold a JSON object, repeats a key or has a servers value
  that is not an object, a `.codex/config.toml` init cannot scan safely or that sets the verbatra
  server inline, with dotted keys, as an array of tables or twice, or a symbolic link on the path
  of a client `--client` names, exits 2 with `AGENT_FILE_INVALID` before anything is written.

**Errors**
- `errorHint(error)` returns the next step for any error code, printed as a `next:` line and a
  `hint` in `--json`. A failed `doctor` check carries `fix`.
- A wrapped error's code is shown as `(cause: CODE)` and `causeCode`.
- `@verbatra/cli` exports `CLI_ERROR_CODES`. Error messages name project-relative paths
  (`projectRelativeMessage`).
- A throw from a `custom:` adapter's parser is `ADAPTER_FAILED` naming the format.
