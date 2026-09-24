---
"@verbatra/studio": patch
---

Tighten how Studio admits, limits, and reports batch review and retranslation calls.

Previously a call refused as already in progress still used up rate-limit budget, a batch larger
than the whole rate-limit window got the same "wait and retry" answer as a busy one, a key named
twice in a batch was retranslated twice, a single retranslation could run on a key a running batch
held, an interrupted batch answered with a bare internal error, and an unreadable glossary made
the edit dialog's key context fail.

Now the in-flight check runs before the rate limiter, an oversized batch is refused with
`BATCH_TOO_LARGE`, repeated batch entries are carried out once, a single retranslation of a key a
running batch holds is refused with `ALREADY_IN_PROGRESS`, an interrupted batch reports the entries
it completed and marks the rest `BATCH_INTERRUPTED`, a batch retranslation waits at most 30 seconds
for a locale's write lock, entries skipped after a batch-wide provider failure say so, and
`key.context` answers with an empty glossary and a `glossaryNotice` when the glossary cannot be
read.
