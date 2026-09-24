---
"@verbatra/sdk": minor
---

Keep a batch's completed outcomes when it is interrupted, and stop `retranslateEntries` at the first
error that would fail every entry.

Previously an error that was not the outcome of one entry was thrown from `approveEntries`,
`rejectEntries`, or `retranslateEntries` as it was, so a caller lost the outcomes of the entries
already carried out, whose writes were on disk. A missing API key, a rejected key, or a rate limit
failed every remaining retranslation one provider call at a time.

Now such an error is thrown as a new `BatchInterruptedError` carrying `results`, the outcomes
completed before it, `entry`, the entry that was running, and the original error as `cause`.
`retranslateEntries` stops calling the provider after `MISSING_API_KEY`, `AUTH_FAILED`,
`RATE_LIMITED`, `NETWORK_POLICY_VIOLATION`, `PROVIDER_CONSTRUCTION_FAILED`, `CONFIG_INVALID`, or
`MACHINE_TRANSLATION_DISABLED`, and reports each later entry as a new `BatchEntrySkipped` outcome
(`ok: false, skipped: true`) naming that code. `retranslateEntry` and `retranslateEntries` accept
`onLockWait` and `lockAcquireTimeoutMs`, which bound the wait for the locale's write lock before
the provider is called. Once an entry's locale lock times out, `retranslateEntries` skips the later
entries needing that lock with `LOCK_CONTENDED` instead of waiting again, and runs the other
locales. `approveEntry`, `rejectEntry`, `approveEntries`, and `rejectEntries` accept the same two
options, and a review batch skips the later entries of a locale whose lock timed out the same way,
so `ReviewBatchOutcome` gains `BatchEntrySkipped`. `translate`, `watch`, `importWorkbook`,
`retranslateEntry`, `retranslateEntries`, and the four review calls throw the new
`LOCK_TIMEOUT_INVALID` for a `lockAcquireTimeoutMs` that is not a whole number of milliseconds of
at least 0.
