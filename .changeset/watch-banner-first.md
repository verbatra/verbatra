---
"@verbatra/sdk": patch
"@verbatra/cli": patch
---

Print the `watch` startup line before the initial run.

Previously `verbatra watch` announced the session only after the initial run had started, so a run
that failed quickly printed its error before the "watching ... running initial translation" line.
The SDK's `watch` now takes an optional `onReady` callback, called once after its startup checks
pass and right before the initial run, and the CLI prints its startup line there.
