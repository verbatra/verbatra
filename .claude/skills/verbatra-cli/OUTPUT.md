# Human output on stderr

Everything below is for a person watching a terminal. It never reaches stdout,
and `--json` output is byte-identical whatever the flags and the terminal; parse
the envelope, never these lines.

Two global flags go before or after the command name:

- `-q, --quiet` prints only results and errors: no progress lines, no `next:`
  hints, no informational stderr lines. A result summary keeps its notices, and
  warnings a person must see, such as a lock wait or keys left protected, still
  print.
- `--no-color` never colours the output. `VERBATRA_NO_COLOR` does the same from
  the environment. `NO_COLOR`, `NODE_DISABLE_COLORS`, `TERM=dumb` and a truthy
  `CI` also turn colour off, and `FORCE_COLOR` turns it on or off unless
  `--no-color` or `VERBATRA_NO_COLOR` is set.

The spinner runs only when stderr is a terminal, `CI` is not set and `TERM` is not
`dumb`; `VERBATRA_NO_SPINNER` turns it off. Otherwise each step is one plain
`verbatra: ...` line, which is what a CI log shows.

What a human-readable run prints:

- A start line naming the work (`translating 3 locales with gemini/...`,
  `dry run over 3 locales, no provider call`), then one outcome line:
  `[ok] done in 4.2s`, `[ok] dry run done in ..., nothing written`, or
  `[warn] finished in ..., see the summary above` when the exit code is not `0`.
- `next:` hints with the command to run after it, such as `verbatra check` after a
  successful translate. A hint repeats the `--cwd` and `--config` the command was
  given, the `--format` of a `csv`, `tsv`, `xliff2` or `xliff12` export or import,
  and the `--reviewer` of an import, so it can be run as printed.
- A dry run counts keys as `would translate` (`would import` for `import`) and
  `would prune`, never as translated.
- File paths inside the working directory print relative to it; paths outside it
  stay absolute.
- `watch` says `watching <source> (<pattern>); running initial translation`, then
  `waiting for changes...` between runs, `change detected: <paths>` when a source
  file is saved, and `stopped` at the end.
- `studio` prints its URL with the session token on stdout, then on stderr whether
  spend tools and agent tools are on or off (`spend tools off (provider none)` when
  spend was granted but the config disables machine translation), and
  `Studio stopped` at the end.
  `studio --verbose` also prints one `METHOD path status` line per request, with
  the token masked.
- `mcp` prints `verbatra MCP server running on stdio (project <dir>, spend tools
  on|off|off (provider none)|off until a config loads)` once it is ready, with
  `, values redacted` before the closing parenthesis under `--redact-values`, and
  `verbatra MCP server stopped (client closed stdin)` or `(interrupted)` at the
  end. Without a usable config it still starts, says that only `project.snapshot`
  and `project.doctor` work until one loads, and picks up a fixed config on the
  next call with no restart. Started by hand in a terminal, it also prints how
  to add it to a client, how to inspect it, and `Press Ctrl-C to stop.`
- `watch` and `studio` print `press Ctrl-C to stop` when stdin is a terminal.
