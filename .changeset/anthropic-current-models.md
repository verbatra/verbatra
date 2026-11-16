---
"@verbatra/sdk": patch
---

The Anthropic provider works with Claude Sonnet 5.5, Opus 5.5 and Fable 5.2.

**Fixed**
- Requests to these models no longer fail with `HTTP 400, invalid_request_error`: they were rejected for forcing a tool call, which the newest Claude models no longer allow.
- The provider now asks for schema-bound JSON through structured outputs on every model, like the other LLM providers, so older Claude models keep working unchanged.
