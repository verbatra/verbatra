---
"@verbatra/cli": patch
---

Make the new terminal feedback safer and more accurate.

Previously a `next:` hint dropped `--cwd` and `--config`, so running it from the same directory
failed, piped output showed no provider retry, repair round, split retry or file write, and
`studio --verbose` forwarded Studio's startup line, which carries the session token, to stderr.
After a failed `watch` run on a terminal the spinner stayed dead for the next run, `types --check`
said `generating the declarations`, color stayed on in CI, a bare `verbatra` ran the config file
to decide whether to suggest `verbatra init`, and an interrupt could leave a spinner frame behind.

Now a `next:` hint repeats `--cwd` and `--config` (quoted when a shell would split them) and names
the file relative to `--cwd`, piped and CI output add one plain line for each retry, repair, split
and write, `studio --verbose` forwards only request lines with any token masked, the next `watch`
run draws a fresh spinner, `types --check` says `checking the declarations`, color is off when
`CI` is set unless `FORCE_COLOR` asks for it, a bare `verbatra` only looks for a config file, and
the spinner line is cleared before the process exits. The `mcp` banner now comes from
`@verbatra/mcp`, with a plain ready line when an older `@verbatra/mcp` lacks it. `doctor --json`
output changes in one field: the `network-policy` check's `detail` no longer starts with
`Network policy:`.
