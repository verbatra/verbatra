---
"@verbatra/sdk": minor
---

Add `approveEntries`, `rejectEntries`, and `retranslateEntries` to decide on or retranslate several
entries in one call, and bound the lock wait of every entry call.

Previously a caller that wanted to retranslate many entries had to loop `retranslateEntry` itself
and turn every thrown error into its own report, `retranslateEntry` waited up to ten minutes for a
busy locale's write lock with no way to shorten or observe the wait, and `translate` and `watch`
took any `lockAcquireTimeoutMs` value.

Each new function runs the single-entry call once per entry, in order, and returns `{ results }`
with one outcome per entry. An entry that fails with an `SdkError`, adapter error, or
`ProviderError` reports `{ ok: false, code, message }` with a redacted message and the batch
carries on. Any other error stops the batch and is thrown as a new `BatchInterruptedError`
carrying `results`, the outcomes completed before it, `entry`, the entry that was running, and the
original error as `cause`, so the outcomes of the entries already written to disk are not lost.

`retranslateEntries` stops calling the provider after `MISSING_API_KEY`, `AUTH_FAILED`,
`RATE_LIMITED`, `NETWORK_POLICY_VIOLATION`, `PROVIDER_CONSTRUCTION_FAILED`, `CONFIG_INVALID`, or
`MACHINE_TRANSLATION_DISABLED`, and reports each later entry as a new `BatchEntrySkipped` outcome
(`ok: false, skipped: true`) naming that code.

`retranslateEntry`, `approveEntry`, `rejectEntry`, and the three batch functions accept
`onLockWait` and `lockAcquireTimeoutMs`, which bound the wait for the locale's write lock before
the provider is called or a decision is written. Once an entry's wait for its locale's lock times
out, a batch skips the later entries needing that lock with `LOCK_CONTENDED` instead of waiting
again, and runs the other locales, so `ReviewBatchOutcome` includes `BatchEntrySkipped` too.
`translate`, `watch`, `importWorkbook`, and every single-entry and batch call throw the new
`LOCK_TIMEOUT_INVALID` for a `lockAcquireTimeoutMs` that is not a whole number of milliseconds of
at least 0.
