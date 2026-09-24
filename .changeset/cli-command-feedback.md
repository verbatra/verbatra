---
"@verbatra/cli": minor
---

Show what every command is doing and what to run next.

Previously most commands printed nothing until their result appeared, `translate` went quiet
during a provider call, and only a few commands suggested a next step.

Now each command shows a `label... done (0.3s)` line on stderr, or a spinner on an interactive
terminal, `translate` and `watch` show the locale, batch, provider retry, repair round and write
as they happen, `translate` ends with its elapsed time and token count, `watch` names the change
it picked up, and `export`, `import`, `tmx import`, `diff`, `pseudo`, `types`, `extract` and
`translate` end with a `next:` hint. stdout, `--json` output and today's piped progress lines are
unchanged, and `--quiet` drops the new lines.
