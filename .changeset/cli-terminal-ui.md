---
"@verbatra/cli": minor
---

Add `-q/--quiet` and `--no-color`, and adapt stderr to the terminal it writes to.

Previously every command wrote the same uncolored stderr lines wherever it ran, and there was no way
to silence progress output.

Now `--quiet` keeps only results, the notices in a result summary included, warnings and errors,
dropping progress lines, `next:` hints and informational stderr lines; `--no-color` or
`VERBATRA_NO_COLOR` turns color off, `NO_COLOR` and `FORCE_COLOR` are honored, and fixed labels such
as `error` are colored on an interactive terminal. Color is off when `CI` is set unless
`FORCE_COLOR` asks for it. `VERBATRA_NO_SPINNER` replaces animated progress with static lines.
Piped, CI and `--json` output are unchanged, and the `init` prompts now pass through the same
redacting output as every other line.
