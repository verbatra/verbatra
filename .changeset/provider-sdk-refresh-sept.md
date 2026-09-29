---
"@verbatra/sdk": patch
"@verbatra/cli": patch
"@verbatra/mcp": patch
---

Refresh runtime dependencies that reach consumers of the published packages.

- `@verbatra/sdk`: bundled provider SDKs `@anthropic-ai/sdk` 0.127.0 -> 0.128.0, `@google/genai`
  2.23.0 -> 2.24.0 and `openai` 7.19.0 -> 7.23.0, plus `@formatjs/icu-messageformat-parser`
  3.5.19 -> 3.5.20 for ICU parsing.
- `@verbatra/mcp`: `@modelcontextprotocol/sdk` 1.30.0 -> 1.30.1.

No behavior change is intended. Every bump is a minor or patch release of the dependency.
