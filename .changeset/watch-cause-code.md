---
"@verbatra/sdk": patch
"@verbatra/cli": patch
---

Carry the wrapped error's code through a failed `watch` run.

Previously a failed run's `error` held only `code`, `message` and `hint`, so `verbatra watch` never
ended its error line with `(cause: CODE)` and its `--json` record had no `causeCode`, unlike
`translate`. A failed run now carries `causeCode` when the error wraps a coded one, such as
`MISSING_API_KEY` under `PROVIDER_CONSTRUCTION_FAILED`, and both outputs show it.
