---
"@verbatra/cli": patch
---

Fix several gaps in the CLI's human output.

Previously `watch` wrote a failed run's error to stdout, commands that topped up `.gitignore` did
so silently, a dry run counted keys as `translated`, `export`, `tmx`, `pseudo` and `types` printed
absolute paths, and a bare `verbatra` printed only the help.

Now a failed `watch` run's `verbatra: error [CODE] message` line goes to stderr, a `.gitignore`
top-up prints `verbatra: updated .gitignore (added ...)` on stderr, a dry run reads
`would translate`, `would import` and `would prune`, paths inside the working directory print
relative to it, and a bare `verbatra` with no config suggests `verbatra init`. JSON output keeps
its shape and fields; the one text change it carries is the `doctor` network-policy check's
`detail`, which no longer repeats the check title.
