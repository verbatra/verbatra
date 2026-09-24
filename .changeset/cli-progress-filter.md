---
"@verbatra/cli": patch
---

Keep the SDK's new progress event types out of the CLI's progress output.

The CLI now ignores any progress event type it does not render, so `--json` stderr still carries
only `locale-started`, `sub-batch`, `locale-finished` and `run-finished` records, and plain human
output keeps exactly the lines it printed before.
