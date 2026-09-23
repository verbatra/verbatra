---
"@verbatra/sdk": patch
---

Redact the value of a key read through an `openai-compatible` provider's custom `apiKeyEnvVar`.

Before, `redact` and the `ProviderError` backstop only scrubbed the exact values of the built-in
provider key variables, so a key held in a variable named by `apiKeyEnvVar` was caught only when
it happened to match a known key shape, and could reach Studio, the MCP tools, or a run summary.

Now loading a config that names `apiKeyEnvVar`, or building that provider, adds the variable to
the same set the built-in ones live in, and its value is scrubbed everywhere they are.
