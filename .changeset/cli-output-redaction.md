---
"@verbatra/cli": patch
---

Redact API keys from everything the CLI prints.

Previously only provider error messages were scrubbed, when they were built, so another error
message or a value in a summary could reach stdout, stderr or the `--json` envelope with a key
value still in it.

Now every line the CLI writes, human output, the `--json` envelope and every error line, passes
through the SDK's `redact` as a last step, the same way `@verbatra/mcp` and `@verbatra/studio`
scrub their output. That covers the built-in provider key variables, the variable an
`openai-compatible` provider names through `apiKeyEnvVar`, and common API key shapes.
