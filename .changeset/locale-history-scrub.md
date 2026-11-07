---
"@verbatra/sdk": patch
---

`localeHistory` no longer returns an API key that a commit subject or author name quotes.

- **What changed:** every commit `subject` and `author` has anything shaped like a provider key, or equal to a configured key variable, replaced by `[REDACTED]` before it is cut to its limit, so a key that straddles the cut can no longer leave a readable part behind. Before this, `subject` and `author` came back as git recorded them.
- **Limits:** a `subject` is cut to 500 characters and an `author` to 200, as in `keyHistory`. A longer subject used to come back whole.
- **Where you see it:** `history.list` in the MCP server and in Studio, and the commit lists in Studio, show the scrubbed text.
