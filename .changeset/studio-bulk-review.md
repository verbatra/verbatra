---
"@verbatra/studio": minor
---

Approve, reject, or retranslate a selection of Review queue entries at once.

Previously every review decision was made one row at a time. Each row now has a checkbox, the
table header selects every shown entry, and `x` toggles the highlighted row. A bar above the table
counts the selection and offers **Approve selected**, **Reject selected** (after a confirmation
that lists the entries), and, with `--allow-spend`, **Retranslate selected**. They call the new
`review.approveMany`, `review.rejectMany`, and `translation.retranslateEntries` methods, backed by
the sdk batch functions, and the line above the table names every entry a batch could not decide.
A batch holds at most 100 entries to decide or 20 to retranslate; a batch retranslation counts
each entry against the retranslate rate limit shared with `translation.retranslateEntry`. None of
the three methods is registered as an agent tool.
