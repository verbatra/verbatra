---
"@verbatra/sdk": patch
---

The Anthropic provider works with Claude Sonnet 5.5, Opus 5.5 and Fable 5.2.

**Fixed**
- Requests to these models no longer fail with `HTTP 400, invalid_request_error`.
- Older Claude models keep working unchanged.
