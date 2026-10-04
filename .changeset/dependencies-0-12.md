---
"@verbatra/sdk": patch
"@verbatra/cli": patch
"@verbatra/mcp": patch
---

Runtime dependency updates that reach consumers of the published packages.

**`@verbatra/sdk`**
- `@anthropic-ai/sdk` 0.127.0 -> 0.128.0
- `@formatjs/icu-messageformat-parser` 3.5.19 -> 3.5.20
- `@google/genai` 2.23.0 -> 2.24.0
- `openai` 7.19.0 -> 7.23.0
- `axios` 1.19.0 -> 1.20.0 (through `deepl-node`, security fix)
- `brace-expansion` 1.1.18 -> 1.1.21 and 2.1.4 -> 2.1.7 (through `exceljs`, security fix)
- `hono` 4.13.5 -> 4.13.12 (through `@google/genai`, security fix)
- `ip-address` 10.7.0 -> 10.7.3 (through `@google/genai`, security fix)

**`@verbatra/mcp`**
- `@modelcontextprotocol/sdk` 1.30.0 -> `@modelcontextprotocol/server` 2.3.0, which no longer
  pulls in `hono`, `ip-address` or `express`
