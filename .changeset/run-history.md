---
"@verbatra/sdk": minor
"@verbatra/mcp": minor
---

Keep a local history of finished runs, with the cost frozen at the rates of the day, and read it with `runHistory` and the `usage.history` MCP tool.

- **What gets recorded:** each `translate`, `watch`, Studio or MCP translate-pending run and retranslation that left a trace adds a record to `.verbatra-local/run-history.jsonl` with time, provider and model, tokens, cost and per-locale counts, never a key name or text. A dry run is not recorded, and the newest 1,000 are kept. Recording is best-effort: a record is skipped when the history file cannot be written or its lock not acquired.
- **Cost is frozen:** the cost is calculated from the config's `rates` at the end of the run and stored with the record (with the rate card's currency and date, not the rates), so a later rate change never rewrites an old run. Where no figure exists the record says so instead of showing zero.
