---
"@verbatra/sdk": minor
"@verbatra/mcp": minor
---

See how one translation key changed from commit to commit with `keyHistory` and the `history.keyRevisions` MCP tool.

- **What you get:** `keyHistory({ config, locale, key })` lists the commits in which the key's value changed in a target locale, newest first. Each revision has the commit, author date, author name (never the email), subject, the value, where it came from (`origin`, read from the provenance file as committed), whether the key's source text has changed since (`sourceChanged`, from the committed lock-file) and a word-level `diff`. A value in the working tree that is not committed comes back as `workingTree`. `history.keyRevisions` returns the same to an MCP client, read-only.
- **How far it reads:** up to 200 commits (50 by default), four files at a time, and it starts no new read after 30 seconds; a git call already running keeps its own 10 second limit. `truncated` says when older commits were not covered, also in a shallow clone, and `unreadableRevisions` counts commits whose file could not be parsed or whose value is longer than 4096 characters. Those are skipped, never returned in part. A revision whose records were not read in time has no `origin` and `sourceChanged: "unknown"`.
- **Limits:** renames are not followed, a commit that removes the key is not listed, a change a merge brought in appears on the merge commit, and a key renamed in the source looks new. `apple-strings` also reads the `.stringsdict` file, and `apple-xcstrings` is read for the one locale.
- **Careful with the repository:** it takes a locale and a key, never a path, and the key never reaches git. It runs git with the same safeguards as `localeGitStatus`, reads files with `git cat-file blob` and parses them in memory. Author names and subjects lose control and bidirectional formatting characters.
- **Redacted values:** under `--redact-values`, `history.keyRevisions` replaces every value with a marker and leaves out the word diffs and the author names.
- **`history.list` reasons:** it now answers `dubious-ownership`, `bare-repository`, `unsafe-config` and `git-too-old` with `available: false` instead of an empty list, as `localeHistory` does. If you map every `LocaleHistoryUnavailableReason` in TypeScript, add those four.
