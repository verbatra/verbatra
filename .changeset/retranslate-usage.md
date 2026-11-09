---
"@verbatra/sdk": minor
"@verbatra/mcp": minor
"@verbatra/studio": minor
---

See what a single-key retranslation cost in tokens: `retranslateEntry` now returns the provider's usage.

- **What you get:** both results, the accepted value and the one the integrity gate refused, carry `usage` with `inputTokens` and `outputTokens` when the provider reports tokens. A refused value spent them too. DeepL, Google Cloud Translation and LibreTranslate report no tokens, so `usage` is absent for them.
- **MCP and Studio:** `translation.retranslateEntry` returns `usage` in its result, also under `--redact-values`, and the Studio retranslate call and its agent tool describe it.
