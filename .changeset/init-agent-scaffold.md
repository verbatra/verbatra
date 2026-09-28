---
"@verbatra/cli": minor
---

Add `verbatra init --agent`, which also sets a project up for coding agents.

Previously `init` wrote only the config, the `.env.example`, and `.gitignore`, and the rules for
agents had to be pasted into an instruction file and the MCP server added to `.mcp.json` by hand.

With `--agent`, `init` also writes a verbatra section between `<!-- verbatra:start -->` and
`<!-- verbatra:end -->` markers into `AGENTS.md` (or into `CLAUDE.md` when that is the only
instruction file), and adds the verbatra MCP server to `.mcp.json`, with spending off. Text outside
the markers and other servers in `.mcp.json` are kept, a second run changes nothing, and a
`verbatra` server that differs from the scaffold is left as it is. A malformed `.mcp.json` or
broken markers stop `init` with `AGENT_FILE_INVALID` before anything is written. The `--json`
result lists both files under `files` and adds an `agent` field.

On a project that already has a config, `init --agent` without config answers or `--force` keeps
the config untouched and writes only the agent files, reporting the config as `unchanged` and
`agent.configKept: true`. Without `--agent`, an existing config is still refused with
`CONFIG_EXISTS`.
