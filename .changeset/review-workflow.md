---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Persisted review decisions, a queue from committed files, and a `--require-reviewed` gate.

**Review queue**
- `reviewQueue` lists every machine-written value (`MACHINE_CLASS_ORIGINS`) nobody has approved,
  read from the committed files, so every teammate and CI job sees the same queue. `locales`
  narrows it and `includeApproved` adds approved values.
- Any edit of an approved value, a hand edit included, drops the approval.
- `runStatus` and the queue ignore a review reason recorded by a newer verbatra.

**Decisions**
- `approveEntry` records that a person accepts the current value, refused with
  `REVIEW_VALUE_CHANGED` or `REVIEW_SOURCE_CHANGED` when it is not what the reviewer saw.
- `rejectEntry` removes the value so the key is refilled, and later runs never reuse the rejected
  value from memory. XLIFF fails with `REVIEW_REJECT_UNSUPPORTED`.
- `approveLocale` approves a whole locale's queue in one write. Decisions take an optional
  `reviewer`.
- `approveEntry` and `rejectEntry` accept `expectedValueHash` instead of `expectedValue`, checked
  with the `valueMarker` from `createValueMarker` that hashed the value the reviewer saw.

**Batches**
- `approveEntries`, `rejectEntries` and `retranslateEntries` return one outcome per entry and stop
  calling the provider after a batch-wide failure such as `RATE_LIMITED`.
- Every entry call takes `lockAcquireTimeoutMs` and `onLockWait`.

**CI gate**
- `verbatra check --require-reviewed` exits 1 while any machine-written value is unapproved and
  lists the keys, with `REVIEW_REQUIRED` or `REVIEW_STATE_UNREADABLE` under `--json`. It is
  keyless. SDK: `check({ requireReviewed })`.
