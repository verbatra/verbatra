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
  there is no `AGENTS.md`) and adds the MCP server to `.mcp.json` with spending off. Run in a
  project that already has a config, it keeps the config and adds only the agent files
  (`agent.configKept` in `--json`).
- An unpaired or repeated verbatra marker, or a `.mcp.json` that is not valid JSON, does not hold
  a JSON object, or has an `mcpServers` value that is not an object, exits 2 with
  `AGENT_FILE_INVALID` before anything is written.

**Errors**
- `errorHint(error)` returns the next step for any error code, printed as a `next:` line and a
  `hint` in `--json`. A failed `doctor` check carries `fix`.
- A wrapped error's code is shown as `(cause: CODE)` and `causeCode`.
- `@verbatra/cli` exports `CLI_ERROR_CODES`. Error messages name project-relative paths
  (`projectRelativeMessage`).
- A throw from a `custom:` adapter's parser is `ADAPTER_FAILED` naming the format.
