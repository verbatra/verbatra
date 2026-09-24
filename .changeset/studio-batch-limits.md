---
"@verbatra/studio": minor
---

Bound the lock wait of bulk approvals and rejections, and let the dashboard see its rate limits.

Previously a bulk approval or rejection waited up to ten minutes per entry for a busy locale, a
rate-limited call named no time to wait, and the dashboard sent a bulk action the server was
bound to refuse.

Now each entry of a bulk approval or rejection waits at most 30 seconds for its locale's write
lock, and the rest of that locale's entries are listed as "Skipped: the locale was busy.". The
`project.snapshot` capabilities carry `limits.retranslate` and `limits.reviewDecision` as
`{ windowMs, max }`, and a `METHOD_RATE_LIMITED` or `BATCH_TOO_LARGE` answer carries
`retryAfterSeconds` and a `Retry-After` header. The dashboard counts its own calls within the
window and does not send a bulk action that would exceed it, showing the limit message with the
seconds to wait. The Review actions column keeps the width of a running retranslation, so a row
going busy no longer shifts the table, and an idle Retranslate button fits its label.
