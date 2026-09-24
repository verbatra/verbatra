---
"@verbatra/studio": minor
---

Approve, reject, or retranslate a selection of Review queue entries at once.

Previously every review decision was made one row at a time. Each row now has a checkbox, the
table header selects every shown entry, and `x` toggles the highlighted row. A bar above the table
counts the selection and offers **Approve selected**, **Reject selected** (after a confirmation
that lists the entries), and, with `--allow-spend`, **Retranslate selected**. They call the new
`review.approveMany`, `review.rejectMany`, and `translation.retranslateEntries` methods, backed by
the sdk batch functions. None of the three methods is registered as an agent tool.

A batch holds at most 100 entries to decide or 20 to retranslate, and a batch retranslation counts
each entry against the retranslate rate limit shared with `translation.retranslateEntry`. A batch
larger than the whole rate-limit window is refused with `BATCH_TOO_LARGE`, without a
`retryAfterSeconds` or `Retry-After`, since a batch that size never fits. Repeated batch entries
are carried out once, and a single retranslation of a key a running batch holds is refused with
`ALREADY_IN_PROGRESS`.

Each entry of a batch waits at most 30 seconds for its locale's write lock; once one entry of a
locale runs out of that time, the rest of that locale's entries are listed as "Skipped: the locale
was busy." and the other locales carry on. Entries skipped after a batch-wide provider failure say
so. A batch stopped by an unexpected error reports the entries it completed and marks the rest
`BATCH_INTERRUPTED` with a fixed message, while the error itself is written to the server's output
as a `studio error: ` line. The line above the table lists every entry a batch could not decide,
grouped by cause, and only the failed entries stay selected.
