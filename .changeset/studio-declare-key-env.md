---
"@verbatra/studio": patch
---

Declare the key variable of the loaded config, so its value is always redacted.

`startStudioServer` now declares the variable an `openai-compatible` provider names through
`apiKeyEnvVar` from the config its loader returns, so its value is scrubbed from every response and
event even when the config did not come from `loadConfig`.
