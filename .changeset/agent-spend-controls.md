---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Add a per-run token ceiling: `translate({ maxTokens })` and `verbatra translate --max-tokens <n>`.

Previously the only token budget was the config's `maxTokens` and `budgetBehavior`, so a single
run could not be capped without editing the config.

Now a run can carry its own ceiling. It is always a hard stop: a provider request that would pass
it is withheld rather than sent, whatever `budgetBehavior` says, and its keys are listed under
`budgetWithheld`. When the config also sets `maxTokens`, the lower of the two applies. A value that
is not a whole number of at least 1 is refused with `MAX_TOKENS_INVALID` in the SDK and with
`INVALID_MAX_TOKENS` (exit 2) on the CLI, and like a configured budget it cannot be combined with
a `concurrency` above 1 on a live run. A run the ceiling cut short exits 1, as it does under a
configured `stop` budget.
