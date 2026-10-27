# Initialising a project

## Setting a project up

Requires Node `^22.18.0 || >=24`.

`verbatra init` detects the format and the file layout from the locale files it
finds and falls back to the `package.json` dependencies only when no locale file
decides it. Unattended, run it with `--json` (which never prompts) and every
choice you already know as a flag: `--provider`, `--format`, `--source`,
`--targets`, `--path`, and for `openai-compatible` also `--base-url`, `--model` and
optionally `--api-key-env-var`, which names a variable and never holds a key, or for
`libretranslate` only `--base-url`. Add
`--yes` to accept a default for anything neither passed nor detected. The success
record names the files it wrote, the resolved config, where each value came from
(`sources`), what was detected with its `confidence`, and `nextSteps`.

`--agent` (off by default) also sets the project up for coding agents: it writes
a verbatra section between `<!-- verbatra:start -->` and `<!-- verbatra:end -->`
markers into `AGENTS.md`, or into `CLAUDE.md` when that is the only instruction
file (`AGENTS.md` wins when both exist, unless only `CLAUDE.md` already holds
the markers), and adds the `verbatra` server, `npx -y @verbatra/mcp` with
spending off, to the project MCP config of each client it wires:

- Claude Code (`--client claude`): `.mcp.json` under `mcpServers`, detected by
  `CLAUDE.md`, a `.claude/` folder or `.mcp.json`.
- Cursor (`--client cursor`): `.cursor/mcp.json` under `mcpServers`, with
  `--cwd ${workspaceFolder}` in `args`, detected by a `.cursor/` folder or
  `.cursorrules`.
- VS Code (`--client vscode`): `.vscode/mcp.json` under `servers`, detected by
  `.vscode/mcp.json`.
- Codex (`--client codex`): `.codex/config.toml`, appended as a
  `[mcp_servers.verbatra]` table with `startup_timeout_sec = 60`, detected by a
  `.codex/` folder. Codex loads it only after the human answers its "Trust this
  folder?" prompt, which is keyed to the repository root.
- Gemini CLI (`--client gemini`): `.gemini/settings.json` under `mcpServers`,
  detected by a `.gemini/` folder or `GEMINI.md`. Gemini CLI reads only the
  settings of the folder it starts in: the human starts `gemini` in the project
  root and trusts it in the dialog or with `/permissions trust` (there is no
  `gemini trust` command). It loads `GEMINI.md`, not `AGENTS.md`, so unless its
  settings or `GEMINI.md` already load the instruction file, `nextSteps` says to
  set `"context": { "fileName": ["AGENTS.md", "GEMINI.md"] }` in
  `.gemini/settings.json` or add the line `@AGENTS.md` to `GEMINI.md`.

With no marker at all, only Claude Code is wired. A `.vscode` folder without
`mcp.json` is not wired; `nextSteps` suggests `init --agent --client vscode`.
`--client claude,cursor,vscode,codex,gemini` (or `all`) replaces detection and needs `--agent`;
an unknown id or an empty list fails with `INVALID_OPTION` and the accepted ids in
`candidates`. `--dry-run` writes nothing, reports every file with the action it
would take, and sets `dryRun: true`.

In a file that already holds the section, the text between the markers is
replaced with the current text and reported `updated`, or `unchanged` when it
already matches; never put your own notes between the markers. Text outside the
markers and other servers are kept, a rerun with the same verbatra leaves every
file byte-identical, and a `verbatra` server that differs is left as it is and
reported as `differs`. Never hand-edit a differing server back without asking the
human. The record's `agent` field (`null` without the flag) lists every client
under `agent.clients[]` as `{ id, file, server, reason, selectedBy, markers }`:
`server` is `added`, `present`, `differs` or `skipped`, `reason` is `null`,
`plugin` or `symlink`, and `selectedBy` is `flag`, `markers` or `default`.
`agent.mcpServer` repeats the Claude Code client's `server`, and is `null` when
Claude Code was not wired.

When `.claude/settings.json` or `.claude/settings.local.json` enables the verbatra
Claude Code plugin, `init` skips `.mcp.json` (`server: "skipped"`,
`reason: "plugin"`), because the plugin brings its own server; it never deletes an
existing entry, so if `.mcp.json` already names `verbatra`, tell the human to
remove it or disable the plugin. Never install the plugin next to a `.mcp.json`
`verbatra` entry yourself: the two register the server twice. A detected client
whose file sits behind a symbolic link is skipped (`reason: "symlink"`); named
with `--client`, the same file is refused with `AGENT_FILE_INVALID`.

In a project that already has a config, run `verbatra init --agent --json` with
no config flag and no `--force`: it keeps the config untouched (listed
`unchanged`, `agent.configKept: true`, and `config`, `sources`, `apiKeyEnvVar`
and `detection` are `null`) and writes only the agent files. Adding a config flag
puts the config back into the run, so a differing answer is refused with
`CONFIG_EXISTS`.

What neither a flag nor detection decides falls back to a default: format
`i18next-json`, source `en`, targets `de`, and the path (with its
`files.localeStyle`) in the format's row of the table in [FORMATS.md](FORMATS.md). The source has no
default when a file holds strings under no locale name, such as
`messages.properties` beside `messages_de.properties` or a gettext `.pot`: pass
`--source`, and follow the `nextSteps` entry about that file, since verbatra reads
the source only from the path its pattern names for the source locale. A
defaulted format is named in `nextSteps` too, since nothing backed it.

Branch on the failure `code`, all of them exit `2`:

| Code | What to do |
| --- | --- |
| `MISSING_OPTIONS` | Pass the flags listed in `missing`, or `--yes` to take the defaults. `--yes` cannot fill a flag without a default: `openai-compatible` still needs `--base-url` and `--model`, and `libretranslate` needs `--base-url`. |
| `INVALID_PROVIDER`, `INVALID_FORMAT` | Pass one of the values listed in `candidates`. |
| `INVALID_OPTION` | A flag does not fit the chosen provider, such as `--base-url` without `openai-compatible` or `libretranslate`, `--cwd` names no existing directory, or `--client` is given without `--agent`, empty or with an unknown id (`candidates` lists `claude`, `cursor`, `vscode`, `codex`, `gemini` and `all`). `doctor` raises it too, for `--locales` or `--live` together with `--literals` and for `--data-flow` together with `--literals`, `--locales` or `--live`, `pseudo` for an unknown `--mode`, and `check` for an empty `--file` or `--file` with `--locales`, `--consistency`, `--require-reviewed` or `--sensitive`. |
| `INIT_UNWRITABLE` | `init` could not write a file into its directory, for example a read-only one, or `verbatra.config.ts`, `.env.example` or `.gitignore` is a symbolic link that resolves outside the project. The message names the file, the cause and any file already written; the hint says: Make the directory writable, or replace the symbolic link the message names with a plain file, then run `verbatra init` again. Tell the human rather than retrying. |
| `FORMAT_AMBIGUOUS`, `LAYOUT_AMBIGUOUS` | Several fit; ask the human which of `candidates` is right and pass `--format` or `--path`. |
| `CONFIG_EXISTS` | A `verbatra.config.ts` is already there (reported before any missing or ambiguous answer); an identical one passes as `unchanged`, a different one is refused; never add `--force` unless the human asked to replace it. Another config file verbatra would read first (or a `verbatra` key in `package.json`) is refused even with `--force`. |
| `CONFIG_INVALID` | The answers do not form a valid config, including a `--source` or `--targets` locale that is not a BCP 47 code; the message says which field. |
| `AGENT_FILE_INVALID` | With `--agent`: a client's MCP config is not plain JSON (comments or trailing commas, as JSONC allows), is not an object, holds a non-object under its servers key or repeats a key, `.codex/config.toml` is TOML `init` cannot scan safely (an unterminated string, array or table header, or tables nested too deep) or defines `mcp_servers` or the verbatra server inline, with dotted keys, as an array of tables, or twice (the table or a key in it), the instruction file has unpaired or repeated verbatra markers, or a file sits behind a symbolic link `init` will not write through (an instruction file linking outside the project, a client file named with `--client`). The hint says: Repair the MCP config or the verbatra markers in the file the message names, or replace the symbolic link it names with a plain file, then run `verbatra init --agent` again. Show the human the message and let them fix the file by hand. |

Re-running `init` with the same answers is safe: an identical
`verbatra.config.ts` is reported `unchanged`, and a missing key variable is
appended to `.env.example` rather than replacing it. Run `doctor` afterwards.
