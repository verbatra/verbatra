---
"@verbatra/studio": minor
---

Show the review queue from the committed files, filter it by origin and review state, and approve a
whole locale at once.

Previously the Review page listed only the keys the last translate run on this machine flagged, and
hid a decided or edited row with an in-tab overlay until the page reloaded. It now lists every
translation a provider, the translation memory, a fuzzy match, or an AI agent wrote that nobody has
approved yet, read from the locale files, `verbatra.lock.json`, and `verbatra.provenance.json`, so
every teammate who pulls the files sees the same queue; the in-tab overlay is gone and every change
re-reads the queue. Each row shows its origin next to the last run's flags. New filters narrow the
queue by origin (machine, memory, fuzzy match, agent) and by review state: **Approved** lists the
values already approved, which can still be rejected. With a locale chosen, **Approve all in
<locale>** approves that locale's whole queue, or only the chosen origin, after a confirmation,
through the new `review.approveLocale` method, which shares the review-decision rate limit and is
not offered as an agent tool. `review.queue` takes an optional `includeApproved`. The WebMCP agent
tools now include `verbatra_review_approve` and `verbatra_review_reject`, which require the name of
the person who made the decision, and `review.approve` and `review.reject` accept an optional
`reviewer`.
