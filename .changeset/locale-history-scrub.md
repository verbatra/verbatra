---
"@verbatra/sdk": patch
"@verbatra/mcp": patch
---

`localeHistory` and `history.list` no longer return an API key that a commit subject or author name quotes.

- **What changed:** every commit `subject` and `author` has anything shaped like a provider key, or equal to a configured key variable, replaced by `[REDACTED]`; a former custom key in an unrecognised shape can remain. The text is cleaned of control and bidirectional characters first, scrubbed second and cut to its limit last, so a key that straddles the cut or hides behind padding can no longer leave a readable part behind. A key that one commit quotes plainly is also replaced in every other commit of the same answer, even where a letter is glued to it. A key glued to text is only scrubbed when another commit in the same answer quotes it plainly; on its own, a key with a letter directly before it is not recognised. Before this, `subject` and `author` came back as git recorded them.
- **Limits:** a `subject` is cut to 500 characters and an `author` to 200. A longer subject used to come back whole. When more than 256 distinct keys turn up in one answer, one key is longer than 4096 characters, or the distinct keys add up to more than 65,536 UTF-16 code units, no text can be trusted to be covered, so every non-empty `subject` and `author` becomes `[REDACTED]` (empty text stays empty) and `localeHistory` sets `truncated: true`; `history.list` declares and returns that field.
- **Where you see it:** `history.list` in the MCP server and in Studio, and the commit lists in Studio, show the scrubbed text.
