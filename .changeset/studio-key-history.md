---
"@verbatra/studio": minor
---

See how one translation changed from commit to commit and restore an earlier value from the key editor.

- **History tab:** lists the uncommitted value, then each commit that changed the key within the last 50 commits (200 with **Read further back**) with author, date, subject and a word-level difference. The Review editor has the same list behind **Show history**.
- **Restore:** loads that value as a draft; nothing is written until you save, and it asks first when the source text has changed since. A value that looks like an API key is shown as `[REDACTED]` and cannot be restored.
