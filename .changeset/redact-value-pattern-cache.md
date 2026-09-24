---
"@verbatra/sdk": patch
---

Build the pattern that scrubs configured key values once per set of values.

Previously `redact` rebuilt that pattern on every call, so redacting a large `--json` document or
an MCP result value by value rebuilt it once per string. Now it is rebuilt only when a key
variable changes.
