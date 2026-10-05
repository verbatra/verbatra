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

**Transitive security fixes in your own lockfile**
- verbatra's repository pins patched `axios` 1.20.0 (through `deepl-node`) and `brace-expansion`
  1.1.21 and 2.1.7 (through `exceljs`) with lockfile overrides, which are not part of the published
  packages. Your install resolves these from its own lockfile, so update them there to pick up the
  fixes.

**`@verbatra/mcp`**
- `@modelcontextprotocol/sdk` 1.30.0 -> `@modelcontextprotocol/server` 2.3.0, which no longer
  pulls in `hono`, `ip-address` or `express`; its license changes from MIT to Apache-2.0
