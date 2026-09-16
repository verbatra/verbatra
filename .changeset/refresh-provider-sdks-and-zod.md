---
"@verbatra/sdk": patch
"@verbatra/cli": patch
"@verbatra/mcp": patch
"@verbatra/studio": patch
---

Refresh runtime dependencies that reach consumers of the published packages.

- `@verbatra/sdk`: bundled provider SDKs `@anthropic-ai/sdk` 0.122.0 -> 0.125.0, `@google/genai`
  2.19.0 -> 2.22.0 and `openai` 7.8.0 -> 7.15.0, plus `jszip` 3.10.1 -> 3.10.2 for workbook
  interchange.
- `@verbatra/sdk`, `@verbatra/cli`, `@verbatra/mcp` and `@verbatra/studio`: `zod` 4.5.1 -> 4.6.2.

No behavior change is intended. The JSON Schemas derived from zod (the shipped
`config-schema.json`, the MCP tool input and output schemas, the Studio agent tool schemas and the
provider response schema) are byte-identical under both zod versions.
