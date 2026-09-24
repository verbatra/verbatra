---
"@verbatra/sdk": minor
---

Add `approveEntries`, `rejectEntries`, and `retranslateEntries` to decide on or retranslate several
entries in one call.

Previously a caller that wanted to act on many review entries had to loop `approveEntry`,
`rejectEntry`, or `retranslateEntry` itself and turn every thrown error into its own report. Each
new function runs the single-entry call once per entry, in order, and returns `{ results }` with
one outcome per entry: an entry that fails reports `{ ok: false, code, message }` with a redacted
message and the batch carries on, while an error that is not an `SdkError`, adapter error, or
`ProviderError` is still thrown.
