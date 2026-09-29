---
"@verbatra/mcp": minor
---

Start without a config, add `project.doctor`, and pick up config changes without a restart.

Previously the server exited with `CONFIG_NOT_FOUND` or `CONFIG_INVALID` when the project had no
usable config, so a client added to a project not set up yet got a dead server, and every config
edit needed a restart. The server now starts anyway: `project.snapshot` reports
`configured: false` with the config problem and a pointer to `project.doctor`, and every other
tool refuses with the config error and a `Next step:` line. The new read-only `project.doctor`
tool runs the setup checks of `verbatra doctor` and returns each check's `status`, `detail`, and,
on a failure, a `fix`; it spends nothing and works with or without a config. `project.snapshot`
always carries `configured` now. Before each call the server checks the config file, every file
the config search would try, and the glossary file for changes and loads the config again, so a
created, edited, or fixed config takes effect on the next call; a call already running keeps the
config it started with. When the tool list changes, the server sends
`notifications/tools/list_changed`. `--allow-spend` stays fixed at startup: the spend tools are
listed only once a config with a provider other than `none` is loaded, and a config change never
lists them when spending was not allowed. Only a `--config` path that does not exist still stops
the server at startup. The server handle reports `configured`, the spend state gains `no-config`,
and `mcpUnconfiguredHint` builds the stderr lines printed after the ready line.
