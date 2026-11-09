---
"@verbatra/studio": minor
---

Studio's Overview shows a run history with the cost of recorded runs, and a browser agent can read it.

- **Run history and cost:** a new section on Overview charts cost per run and tokens per run, with a table of the newest recorded runs beside the charts, newest first: when it ran, whether it was Translate or Retranslate, the provider and model, tokens in and out, cost and the result counts. The table shows ten runs, with a button for more. Dry runs and runs that change nothing are not recorded, so a new project shows "No runs recorded yet".
- **Cost wording:** an amount is the tokens the provider reported times the rate on file when the run ended. "Estimated" marks a figure from source characters, for a machine-translation provider that reports no usage, and says what it leaves out. "At least" marks a lower bound, when part of the usage went unreported. "No rate" means your config has no rate for that model, or one with the wrong unit. "Unknown" means keys were sent and no tokens came back, and "not billed" covers self-hosted providers and `none`. None of them is shown as free.
- **Coverage:** a separate table shows each locale's last known missing, stale and up to date counts, and marks a locale the latest run did not measure as "Not measured in this run".
- **Unreadable records:** when lines of the history file cannot be read, Studio says how many are left out and that the next recorded run rewrites the file without them. A file that cannot be read at all, or is over 8 MiB, shows its own notice instead of an empty list.
- **Agent tool:** `verbatra_usage_history` returns the same records to a browser agent, read-only and without spending: counts only, never a key or a text, with an optional `limit`.
- **Live refresh:** the section reads again when `.verbatra-local/run-history.jsonl` changes, when the tab regains focus, and after a translate-pending or retranslate call returns.
