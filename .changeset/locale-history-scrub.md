---
"@verbatra/sdk": patch
"@verbatra/mcp": patch
---

`localeHistory` and `history.list` no longer return an API key that a commit subject or author name quotes.

- **What changed:** anything shaped like a provider key, or equal to a configured key variable, is replaced by `[REDACTED]` in every commit `subject` and `author`.
- **Limits:** a `subject` is now cut to 500 characters and an `author` to 200.
