---
"@verbatra/sdk": minor
"@verbatra/mcp": minor
---

See how one translation key changed from commit to commit with `keyHistory` and the `history.keyRevisions` MCP tool.

- **What you get:** `keyHistory({ config, locale, key })` lists the commits that changed the key's value in a locale, newest first, with date, author name (never the email), subject, value, origin and a word-level diff. `history.keyRevisions` returns the same to an MCP client, read-only.
- **Keys are scrubbed:** values, diffs, subjects and author names pass `redact`; a value that held an API key comes back as `[REDACTED]` and must not be restored.
- **Upgrade:** `localeHistory` and `history.list` now answer `dubious-ownership`, `bare-repository`, `unsafe-config` and `git-too-old` with `available: false` instead of an empty list. If you map every `LocaleHistoryUnavailableReason`, add those four.
