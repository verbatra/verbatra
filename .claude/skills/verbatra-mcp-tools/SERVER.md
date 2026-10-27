# Running the server

`verbatra mcp` needs `@verbatra/mcp` beside the CLI; without it the command exits
`2` and says so. `npx -y @verbatra/mcp` runs the server on its own, and takes the
same `--cwd`, `--config`, `--allow-spend` and `--redact-values`. Both refuse an unknown flag, such as
the typo `--allowspend` or `--json`, with exit `2` and a `USAGE_ERROR` on stderr
rather than starting without it, and both answer `--help` and `--version` with
exit `0` without starting the server. Without `--cwd` the server runs over
`CLAUDE_PROJECT_DIR` when that names an existing directory, which is what Claude
Code sets for a server it starts, and over its own working directory otherwise.

The server speaks MCP protocol revision `2026-07-28` and every earlier revision
back to `2024-10-07`, so an older client connects too.

Stdout carries nothing but MCP protocol messages. On stderr the server prints
`verbatra MCP server running on stdio (project <dir>, spend tools on|off)` once it
is ready (`spend tools off (provider none)` when spend was granted but the provider
is `none`, `spend tools off until a config loads` when no usable config is
loaded yet, with `, values redacted` appended in that mode), and `verbatra MCP server stopped (client closed stdin)` or
`(interrupted)` when it ends; `verbatra mcp --quiet` leaves both out. An interrupt
stops either binary within a few seconds, even while a tool call waits on the
provider, and releases any locale lock it holds; a second interrupt force-stops it
with exit code `130` (`143` after SIGTERM for `verbatra-mcp`). Started by
hand with a terminal on stdin, it adds how to add it to a client, how to inspect
it, and how to stop it. Without a usable config it first prints
`Running without a usable project config: <CODE>: <message>` and, after the ready
line, how to set the project up; each later config reload adds one line. `verbatra mcp --json` is refused with exit `2` and a
`USAGE_ERROR` on stderr, since stdout belongs to the protocol.

## Without a config

The server starts even when the project has no config, or one that does not load.
Then `project.snapshot` returns `configured: false`, a `configProblem` with the
code (`CONFIG_NOT_FOUND` or `CONFIG_INVALID`) and message, and a `nextStep`. Every
tool except `project.snapshot` and `project.doctor` stays listed but refuses with
that code and a `Next step:` line, and the spend tools are not listed even with
spend granted. Call `project.doctor`, relay each failed check's `fix` to the
human (for a project without verbatra that is `npx @verbatra/cli init`), and do not
retry other tools until the config is fixed.

No restart is needed afterwards. Before each call the server checks the config
file, the files the config search would try, and the glossary file for changes
and loads the config again, so the next call after a fix works; call
`project.snapshot` again to see the new config. A call already running keeps the
config it started with. A config change never grants spend: the spend tools
appear only when the operator granted it at startup and the new config names a
provider. When the tool list changes the server sends
`notifications/tools/list_changed`; list the tools again. Only the config file
itself is checked, so an edit to a module a JavaScript or TypeScript config
imports needs a server restart.
