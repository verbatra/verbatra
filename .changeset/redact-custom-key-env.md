---
"@verbatra/sdk": patch
---

Redact the value of a key read through an `openai-compatible` provider's custom `apiKeyEnvVar`.

Before, `redact` and the `ProviderError` backstop only scrubbed the exact values of the built-in
provider key variables, so a key held in a variable named by `apiKeyEnvVar` was caught only when
it happened to match a known key shape, and could reach Studio, the MCP tools, or a run summary.

Now loading a config that names `apiKeyEnvVar`, or building that provider, declares the variable
process-wide, shared by every copy of the SDK in the process, and its value is scrubbed everywhere
the built-in ones are. The new `declareProviderKeyEnvVar` does the same for a config obtained some
other way. Values shorter than eight characters are no longer scrubbed by value, so a short
variable can never wipe unrelated text, and all values are replaced in a single pass.
