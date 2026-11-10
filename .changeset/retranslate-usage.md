---
"@verbatra/sdk": minor
"@verbatra/mcp": minor
"@verbatra/studio": minor
---

See what a single-key retranslation cost in tokens: `retranslateEntry` now returns the provider's `usage` (`inputTokens`, `outputTokens`), also for a refused value, in the SDK, the MCP tool `translation.retranslateEntry` and Studio. DeepL, Google Cloud Translation and LibreTranslate report none.
