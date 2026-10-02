---
"@verbatra/studio": minor
---

Saved review decisions from committed files, bulk and keyboard review, rate-limit feedback.

**Upgrading from 0.5**
- The Review queue is built from the committed files. Approve and Reject now write files (Reject
  removes the value) and are rate limited to 60 calls a minute by default, set through
  `reviewDecisionRateLimitWindowMs` and `reviewDecisionRateLimitMax`.
- `METHOD_RATE_LIMITED` carries `retryAfterSeconds` and a `Retry-After` header.

**Review queue**
- The queue lists every value a provider, the translation memory, a fuzzy match or an agent wrote
  that nobody has approved, so every teammate who pulls the files sees the same queue. Each row
  shows its current translation, origin and the last run's flags, including **Other-syntax
  placeholder changed** for a translation that dropped or changed such a placeholder.
- Filters narrow the queue by origin and review state. **Approve all in <locale>** approves a whole
  locale after a confirmation.
- Reject asks for confirmation and removes the translation so the next run replaces it.

**Bulk and keyboard**
- Select rows to **Approve selected**, **Reject selected** or, with `--allow-spend`,
  **Retranslate selected**, up to 100 decisions or 20 retranslations per batch. A busy locale is
  skipped after 30 seconds and the rest carries on.
- `j` and `k` move through the queue, `a` approves, `r` rejects, `e` or Enter edits, `t`
  retranslates, and `?` lists the shortcuts. With `--allow-spend`, each row has **Retranslate**.
- A running retranslation shows its elapsed time and survives a page reload. Focus returns to the
  queue after a decision or a save.

**Rate limits and agents**
- The dashboard knows its rate limits and shows the seconds to wait instead of sending a call the
  server would refuse. A refused duplicate costs nothing.
- The agent tools include `verbatra_review_approve` and `verbatra_review_reject`, which require
  the reviewer's name. Bulk and whole-locale actions are not agent tools.
