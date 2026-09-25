---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Add `approveEntry`, `rejectEntry` and `reviewQueue` for persisted review decisions.

Previously the review queue was the last run's flags as recorded, and a review decision could not
be saved.

`approveEntry` records that a person accepts a key's current value. It writes only the provenance
file, stores the source hash it was given against, and is refused when the value is not the one
the reviewer saw (`REVIEW_VALUE_CHANGED`) or its source changed since it was written
(`REVIEW_SOURCE_CHANGED`). `rejectEntry` records a refusal and removes the value from the locale
file and the lock file, so the key reads as missing until the next `translate` or a person fills
it; the matching translation-memory entry is dropped too, and a later `translate` or `watch` run
skips any exact or fuzzy memory hit, from any teammate's memory, whose value hash matches the
key's `rejected` record, under every `humanEdits` setting. A fuzzy lookup then reuses the best
remaining candidate above the threshold, and when none is left the key goes to the provider, or
stays unfilled under provider `none`. A provenance file the run cannot read, one from a newer
verbatra or a corrupt one under `humanEdits: "overwrite"` (which does not fail the run), carries no
rejections, so a rejected hit can still be reused then. If a step fails, the locale file and
provenance file are restored on failure, and `REVIEW_RESTORE_FAILED` names any file that could not
be put back. A format that cannot drop one value, XLIFF, fails with `REVIEW_REJECT_UNSUPPORTED`
and keeps the file. Both take an optional
`reviewer` of at most 64 characters (`REVIEWER_INVALID`), refuse a call from JavaScript whose
`expectedValue` is not a string with `REVIEW_VALUE_CHANGED` before reading anything, and fail with
`PROVENANCE_FILE_UNWRITABLE` rather than report a decision they could not save. `reviewQueue`
returns the last run's flags minus every key approved, rejected, or rewritten by a person since.
A provenance record carries the optional `reviewedSourceHash` field.
