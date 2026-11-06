---
"@verbatra/sdk": minor
---

See which locale files changed in git, and what changed in each, with `localeGitStatus` and `localeGitDiff`.

- **What you get:** `localeGitStatus` lists the locale files, `verbatra.lock.json` and `verbatra.provenance.json` that differ from the last commit, each as `modified`, `added`, `deleted`, `untracked` or `conflicted`, plus the checked-out branch. `localeGitDiff` compares one locale at `HEAD` with the file on disk and lists the keys added, removed and changed, with their text, capped at 500 keys and 2000 characters per text.
- **Safe on any repository:** both take a locale, never a path, and run git without a shell, with optional locks, `core.fsmonitor`, submodule inspection and every content filter the repository configures switched off, a timeout and an output cap, so a repository's own configuration cannot run a command. A repository that git refuses over ownership, a missing git, a project outside a work tree and a `custom:` format come back as `available: false` with a reason instead of throwing.
