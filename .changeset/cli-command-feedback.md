---
"@verbatra/cli": minor
---

Show what every command is doing and what to run next.

Previously most commands printed nothing until their result appeared, `translate` went quiet
during a provider call, and only a few commands suggested a next step.

Now each command shows a `label... done (0.3s)` line on stderr, or a spinner on an interactive
terminal that is cleared before the process exits and redrawn for every `watch` run, `translate`
and `watch` show the locale, batch, provider retry, repair round, split retry and write as they
happen (piped and CI output as one plain line each), `translate` ends with its elapsed time and
token count, `watch` names the change it picked up, and `export`, `import`, `tmx import`, `diff`,
`pseudo`, `types`, `extract` and `translate` end with a `next:` hint that repeats `--cwd` and
`--config` (quoted when a shell would split them) and names the file relative to `--cwd`.
stdout and `--json` output are unchanged, and
`--quiet` drops the new lines.
