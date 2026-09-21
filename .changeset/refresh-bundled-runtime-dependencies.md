---
"@verbatra/sdk": patch
"@verbatra/cli": patch
"@verbatra/mcp": patch
"@verbatra/studio": patch
---

Refresh runtime dependencies that reach consumers of the published packages.

- `@verbatra/sdk`: bundled provider SDKs `@anthropic-ai/sdk` 0.125.0 -> 0.127.0, `@google/genai`
  2.22.0 -> 2.23.0 and `openai` 7.15.0 -> 7.19.0, plus
  `@formatjs/icu-messageformat-parser` 3.5.17 -> 3.5.19 for ICU parsing and `yaml` 2.9.0 -> 2.9.1
  for the YAML format adapter.
- `@verbatra/sdk`, `@verbatra/cli`, `@verbatra/mcp` and `@verbatra/studio`: `zod` 4.6.2 -> 4.6.5.

No behavior change is intended. Every bump is a minor or patch release of the dependency, and the
JSON Schemas derived from zod (the shipped `config-schema.json`, the MCP tool input and output
schemas, the Studio agent tool schemas and the provider response schema) are unchanged.
