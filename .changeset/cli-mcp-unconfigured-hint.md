---
"@verbatra/cli": minor
---

`verbatra mcp` explains how to set a project up when the server starts without a config.

With `@verbatra/mcp` 0.3.0 the server starts even when the project has no usable config. The
command then prints, after the ready line on stderr, that only `project.snapshot` and
`project.doctor` work, that `npx verbatra init` sets the project up, and that no restart is
needed once the config is valid.
