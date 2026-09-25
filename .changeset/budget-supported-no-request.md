---
"@verbatra/sdk": patch
"@verbatra/mcp": patch
---

Report `RunBudget.supported` as `true` for a run that sent no request.

Previously a dry run, or a run with nothing to translate, reported `supported: false` with
`tokensUsed: 0`, which read as an estimated figure although nothing was projected.

Now `supported` is `false` only when at least one request came back without its own usage, so a
run that sent nothing reports `supported: true`. The `usage.summary` tool description says the
same.
