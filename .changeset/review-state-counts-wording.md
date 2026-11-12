---
"@verbatra/mcp": patch
---

Say what the review-state counts cover.

- **Agent tools:** the `status.check` and `lock.state` descriptions now state that `byReviewState` counts every value by its recorded decision, whatever its origin. A value a person wrote or imported with no decision counts as `unreviewed` there although the review queue holds only machine-class values. The counts themselves are unchanged.
