---
"@verbatra/mcp": patch
---

Declare the key variable of the config the server receives, so its value is always redacted.

`createMcpServer` now declares the variable an `openai-compatible` provider names through
`apiKeyEnvVar`, so its value is scrubbed from every tool result and log line even when the config
did not come from `loadConfig`.
