---
"@verbatra/mcp": minor
---

Add the `review.approve` and `review.reject` tools, and build `review.queue` from the committed
files.

`review.approve` records that a person accepts one key's current translation and `review.reject`
refuses it and removes it so it gets replaced, both in the committed `verbatra.provenance.json`.
Both take the value the user reviewed as `expectedValue` and a required `reviewer`, the name of the
person who made the decision, and are meant to be called only on the user's explicit instruction.
They write local files only, spend nothing, and are always listed. `review.queue` now lists every
machine-written value no person has approved, the same queue every teammate sees, rather than the
last run's flags: `available: false` now means the provenance file cannot be read, a locale no
longer carries the run's `status` or `usage`, and the run's time is `lastRunAt`.
